import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GenerateMapQrDto } from '../dto/generate-map-qr.dto';
import { GenerateUserAvatarDto } from '../dto/generate-user-avatar.dto';
import { MediaService } from '../services/media.service';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OwnershipGuard } from '../../auth/guards/ownership.guard';

@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('users/:userId/avatar')
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @ApiOperation({ summary: 'Сгенерировать avatar для пользователя' })
  generateUserAvatar(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: GenerateUserAvatarDto,
  ) {
    return this.mediaService.generateUserAvatar(userId, dto);
  }

  @Post('maps/:mapId/qr')
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @ApiOperation({ summary: 'Сгенерировать QR-code для карты' })
  generateMapQr(
    @Param('mapId', ParseIntPipe) mapId: number,
    @Body() dto: GenerateMapQrDto,
  ) {
    return this.mediaService.generateMapQr(mapId, dto);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @ApiOperation({ summary: 'Получить media asset по id' })
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.mediaService.findById(id);
  }
}
