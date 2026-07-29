import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateMapDto } from '../dto/create-map.dto';
import { ListMapsQueryDto } from '../dto/list-maps-query.dto';
import { UpdateMapDto } from '../dto/update-map.dto';
import { MapsRepository } from '../repositories/maps.repository';
import { MapRecord } from '../types/map-record.type';

/**
 * Сервис карт.
 */
@Injectable()
export class MapsService {
  constructor(private readonly mapsRepository: MapsRepository) {}

  create(dto: CreateMapDto): Promise<MapRecord> {
    return this.mapsRepository.create(dto);
  }

  findAll(query: ListMapsQueryDto): Promise<MapRecord[]> {
    return this.mapsRepository.findAll(query);
  }

  async findById(id: number): Promise<MapRecord> {
    const map = await this.mapsRepository.findById(id);

    if (!map) {
      throw new NotFoundException(`Карта ${id} не найдена`);
    }

    return map;
  }

  async update(id: number, dto: UpdateMapDto): Promise<MapRecord> {
    const map = await this.mapsRepository.update(id, dto);

    if (!map) {
      throw new NotFoundException(`Карта ${id} не найдена`);
    }

    return map;
  }

  async delete(id: number): Promise<{ deleted: true }> {
    const deleted = await this.mapsRepository.delete(id);

    if (!deleted) {
      throw new NotFoundException(`Карта ${id} не найдена`);
    }

    return { deleted: true };
  }
}
