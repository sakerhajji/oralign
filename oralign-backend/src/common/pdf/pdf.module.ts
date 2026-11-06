import { Module } from '@nestjs/common';
import { PdfRendererService } from './pdf-renderer.service';

/**
 * The shared HTML → PDF renderer. Imported only by the modules that
 * print documents, so the payment hot path never loads puppeteer-core.
 */
@Module({
  providers: [PdfRendererService],
  exports: [PdfRendererService],
})
export class PdfModule {}
