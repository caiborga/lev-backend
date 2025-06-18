import { Injectable } from '@nestjs/common';
import { CreateAnalysisDto } from './dto/create-analysis.dto';
import { UpdateAnalysisDto } from './dto/update-analysis.dto';
import axios from 'axios';
import { Logger } from '@nestjs/common';

export interface LevermannResult {
    isin: string;
    scores: Record<string, number>;
    totalScore: number;
}

interface QuoteData {
    c: number; // current price
}

interface MetricData {
    peNormalizedAnnual?: number;
    operatingMarginTTM?: number;
    roeTTM?: number;
    totalAssets?: number;
    totalEquity?: number;
    revenueGrowthQuarterlyYoy?: number;
    epsGrowthTTMYoy?: number;
    recommendationMean?: number;
    ['26WeekPriceReturnDaily']?: number;
    ['52WeekPriceReturnDaily']?: number;
    ['3MonthADReturnStd']?: number;
    beta?: number;
    ['50DayMA']?: number;
}

interface ProfileData {
    marketCapitalization?: number;
}

const logger = new Logger('AnalysisService');

@Injectable()
export class AnalysisService {
    // Enter your API Keys here
    private readonly finnhubKey = 'xxx';
    private readonly alphaVantageKey = 'xxx';

    async analyseStock(isin: string): Promise<LevermannResult> {
        const data = await this.fetchStockData(isin);

        const scores = {
            P_E_Ratio: this.evaluatePERatio(data.peRatio),
            EBIT_Margin: this.evaluateEBITMargin(data.ebitMargin),
            Return_on_Equity: this.evaluateROE(data.returnOnEquity),
            Equity_Ratio: this.evaluateEquityRatio(data.equityRatio),
            Earnings_Reaction: this.evaluateEarningsReaction(
                data.quarterReaction,
            ),
            Earnings_Revisions: this.evaluateEarningsRevisions(
                data.earningsRevision,
            ),
            Analyst_Opinions: this.evaluateAnalystOpinions(data.analystRating),
            Price_Momentum_6M: this.evaluateMomentum(
                data.momentum6m,
                '26WeekPriceReturnDaily',
            ),
            Price_Momentum_12M: this.evaluateMomentum(
                data.momentum12m,
                '52WeekPriceReturnDaily',
            ),
            Moving_Average_Distance: this.evaluateMovingAverage(
                data.distanceFromMA,
            ),
            Price_Stability: this.evaluateVolatility(data.volatility),
            Market_Reaction: this.evaluateMarketReaction(data.beta),
            Market_Capitalization: this.evaluateMarketCap(data.marketCap),
        };

        const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);

        return { isin, scores, totalScore };
    }

    async fetchStockData(isin: string): Promise<any> {
        logger.log(`Fetching data for ISIN: ${isin}`);
        logger.log(`Using API key: ${this.finnhubKey}`);

        function extractValue<T>(
            label: string,
            value: T | undefined,
            fallback: T,
            logger: Logger,
        ): T {
            if (value !== undefined && value !== null) {
                logger.log(`[DATA] ${label} received: ${value}`);
                return value;
            } else {
                logger.warn(
                    `[DATA] ${label} missing, fallback used: ${fallback}`,
                );
                return fallback;
            }
        }

        try {
            const searchUrl = `https://finnhub.io/api/v1/search?q=${isin}&token=${this.finnhubKey}`;
            const searchRes = await axios.get(searchUrl);
            const result = searchRes.data.result.find(
                (item: any) => item.symbol,
            );

            if (!result) {
                throw new Error(`Could not resolve symbol for ISIN: ${isin}`);
            }

            const symbol = result.symbol;
            logger.log(`Resolved symbol: ${symbol}`);

            let quoteRes,
                metricsRes,
                profileRes,
                recommendationRes,
                financialsRes;

            try {
                quoteRes = await axios.get(
                    `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${this.finnhubKey}`,
                );
            } catch (err) {
                logger.error(
                    'Error fetching quote:',
                    err.response?.data || err.message,
                );
            }

            try {
                metricsRes = await axios.get(
                    `https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${this.finnhubKey}`,
                );
            } catch (err) {
                logger.error(
                    'Error fetching metrics:',
                    err.response?.data || err.message,
                );
            }

            try {
                profileRes = await axios.get(
                    `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${this.finnhubKey}`,
                );
            } catch (err) {
                logger.error(
                    'Error fetching profile:',
                    err.response?.data || err.message,
                );
            }

            try {
                recommendationRes = await axios.get(
                    `https://finnhub.io/api/v1/stock/recommendation?symbol=${symbol}&token=${this.finnhubKey}`,
                );
            } catch (err) {
                logger.error(
                    'Error fetching recommendation:',
                    err.response?.data || err.message,
                );
            }

            try {
                financialsRes = await axios.get(
                    `https://finnhub.io/api/v1/stock/financials-reported?symbol=${symbol}&token=${this.finnhubKey}`,
                );
            } catch (err) {
                logger.error(
                    'Error fetching financials:',
                    err.response?.data || err.message,
                );
            }

            //   console.log('quoteRes', quoteRes);
            //   console.log('metricsRes', metricsRes);
            //   console.log('profileRes', profileRes);
            //   console.log('recommendationRes', recommendationRes);
            //   console.log('financialsRes', financialsRes);

            const quote: QuoteData = quoteRes?.data || {};
            const metrics: MetricData = metricsRes?.data?.metric || {};
            const profile: ProfileData = profileRes?.data || {};
            const recommendations = recommendationRes?.data || [];
            const financials = financialsRes?.data || {};

            const currentPrice = extractValue(
                'currentPrice',
                quote.c,
                0,
                logger,
            );

            // Try to get 50-day moving average from Alpha Vantage
            let movingAverage50d = metrics['50DayMA'];
            try {
                const avUrl = `https://www.alphavantage.co/query?function=SMA&symbol=${symbol}&interval=daily&time_period=50&series_type=close&apikey=${this.alphaVantageKey}`;
                const avRes = await axios.get(avUrl);
                const values = avRes.data['Technical Analysis: SMA'];
                if (values) {
                    const firstKey = Object.keys(values)[0];
                    movingAverage50d = parseFloat(values[firstKey]['SMA']);
                }
            } catch (err) {
                logger.error(
                    'Error fetching 50-day MA from Alpha Vantage:',
                    err.response?.data || err.message,
                );
            }

            movingAverage50d = extractValue(
                'movingAverage50d',
                movingAverage50d,
                currentPrice,
                logger,
            );

            const distanceFromMA =
                ((currentPrice - movingAverage50d) / movingAverage50d) * 100;

            let totalEquity = undefined;
            let totalAssets = undefined;
            if (financials?.data?.length) {
                const bs = financials.data[0]?.report?.bs;
                const totalEquityItem = bs.find(
                    item => item.concept === 'us-gaap_StockholdersEquity',
                );
                const totalAssetsItem = bs.find(
                    item => item.concept === 'us-gaap_Assets',
                );

                totalEquity = extractValue(
                    'totalEquity',
                    totalEquityItem?.value,
                    undefined,
                    logger,
                );
                totalAssets = extractValue(
                    'totalAssets',
                    totalAssetsItem?.value,
                    undefined,
                    logger,
                );
            }

            return {
                peRatio: metrics.peNormalizedAnnual,
                ebitMargin: metrics.operatingMarginTTM,
                returnOnEquity: metrics.roeTTM,
                equityRatio:
                    totalAssets && totalEquity
                        ? (totalEquity / totalAssets) * 100
                        : undefined,
                quarterReaction: metrics.revenueGrowthQuarterlyYoy,
                earningsRevision: metrics.epsGrowthTTMYoy,
                analystRating: recommendations?.[0]?.rating,
                momentum6m: metrics['26WeekPriceReturnDaily'],
                momentum12m: metrics['52WeekPriceReturnDaily'],
                distanceFromMA: distanceFromMA,
                volatility: metrics['3MonthADReturnStd'],
                beta: metrics.beta,
                marketCap: profile.marketCapitalization
                    ? profile.marketCapitalization * 1_000_000
                    : undefined,
            };
        } catch (error) {
            logger.error(
                `Error fetching data for ISIN ${isin}:`,
                error.response?.data || error.message,
            );
            throw new Error(
                `API call failed for ISIN ${isin}: ${error.message}`,
            );
        }
    }

    evaluatePERatio(pe: number | undefined): number {
        const fallback = 15;
        const value = this.logAndFallback('peNormalizedAnnual', pe, fallback);
        if (value < 12) return 1;
        if (value > 20) return -1;
        return 0;
    }

    evaluateEBITMargin(margin: number | undefined): number {
        const fallback = 10;
        const value = this.logAndFallback(
            'operatingMarginTTM',
            margin,
            fallback,
        );
        if (value > 12) return 1;
        if (value < 6) return -1;
        return 0;
    }

    evaluateROE(roe: number | undefined): number {
        const fallback = 15;
        const value = this.logAndFallback('roeTTM', roe, fallback);
        if (value > 20) return 1;
        if (value < 10) return -1;
        return 0;
    }

    evaluateEquityRatio(ratio: number | undefined): number {
        const fallback = 30;
        const value = this.logAndFallback('equityRatio', ratio, fallback);
        if (value > 25) return 1;
        if (value < 15) return -1;
        return 0;
    }

    evaluateEarningsReaction(pct: number | undefined): number {
        const fallback = 0;
        const value = this.logAndFallback(
            'revenueGrowthQuarterlyYoy',
            pct,
            fallback,
        );
        if (value > 3) return 1;
        if (value < -3) return -1;
        return 0;
    }

    evaluateEarningsRevisions(pct: number | undefined): number {
        const fallback = 0;
        const value = this.logAndFallback('epsGrowthTTMYoy', pct, fallback);
        if (value > 0) return 1;
        if (value < 0) return -1;
        return 0;
    }

    evaluateAnalystOpinions(rating: number | undefined): number {
        const fallback = 2.5;
        const value = this.logAndFallback(
            'recommendationMean',
            rating,
            fallback,
        );
        if (value < 2) return 1;
        if (value > 3) return -1;
        return 0;
    }

    evaluateMomentum(pct: number | undefined, label: string): number {
        const fallback = 0;
        const value = this.logAndFallback(label, pct, fallback);
        if (value > 5) return 1;
        if (value < -5) return -1;
        return 0;
    }

    evaluateMovingAverage(diff: number | undefined): number {
        const fallback = 0;
        const value = this.logAndFallback('distanceFromMA', diff, fallback);
        if (value > 5) return 1;
        if (value < -5) return -1;
        return 0;
    }

    evaluateVolatility(vol: number | undefined): number {
        const fallback = 50;
        const value = this.logAndFallback('3MonthADReturnStd', vol, fallback);
        if (value < 20) return 1;
        if (value > 60) return -1;
        return 0;
    }

    evaluateMarketReaction(beta: number | undefined): number {
        const fallback = 1;
        const value = this.logAndFallback('beta', beta, fallback);
        if (value < 0.8) return 1;
        if (value > 1.2) return -1;
        return 0;
    }

    evaluateMarketCap(cap: number | undefined): number {
        const fallback = 5_000_000_000;
        const value = this.logAndFallback(
            'marketCapitalization',
            cap,
            fallback,
        );
        if (value > 5_000_000_000) return 1;
        if (value < 1_000_000_000) return -1;
        return 0;
    }

    private logAndFallback<T>(
        label: string,
        value: T | undefined,
        fallback: T,
    ): T {
        if (value !== undefined && value !== null) {
            logger.log(`[DATA] ${label} received: ${value}`);
            return value;
        } else {
            logger.warn(`[DATA] ${label} missing, fallback used: ${fallback}`);
            return fallback;
        }
    }
}
