# Levermann Strategy Stock Analysis API

This project implements an automated analysis of stocks based on the **Levermann Strategy**, using publicly available financial data. The analysis returns a score based on 13 criteria, providing buy/sell recommendations.

## 🚀 Features

- Fetch stock data by ISIN or WKN
- Evaluate all 13 Levermann criteria
- Modular scoring logic with logging and fallbacks
- Integrated with free APIs (Finnhub, Alpha Vantage)
- Designed for extensibility (e.g., frontends or dashboards)

## About the Levermann Strategy

The Levermann strategy is a quantitative stock-picking method developed by former fund manager Susan Levermann. It scores stocks based on key financial metrics such as P/E ratio, return on equity, analyst ratings, and momentum.

## Tech Stack

- **NestJS** (TypeScript)
- **Axios** (for API communication)
- **Finnhub API** + **Alpha Vantage API**
- Planned: React/Next.js frontend

## API Example

### `GET /analysis?isin=US0378331005`

Response:
```json
{
  "isin": "US0378331005",
  "scores": {
    "P_E_Ratio": -1,
    "EBIT_Margin": 1,
    "Return_on_Equity": 1,
    ...
  },
  "totalScore": 5
}
