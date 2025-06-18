import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { AnalysisService } from './analysis.service';
// import { CreateAnalysisDto } from './dto/create-analysis.dto';
// import { UpdateAnalysisDto } from './dto/update-analysis.dto';

@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Get()
  async analyse(@Query('isin') isin: string) {
    if (!isin || isin.length < 8) {
      throw new BadRequestException('Please provide a valid ISIN.');
    }

    try {
      const result = await this.analysisService.analyseStock(isin);

      return result;
    } catch (error) {
      throw new BadRequestException(error.message || 'Error during analysis.');
    }
  }
}
