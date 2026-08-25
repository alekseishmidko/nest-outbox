import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isMysqlForeignKeyReferencedError } from '../../common/utils/mysql-error.util';
import { UsersService } from '../../users/services/users.service';
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
  constructor(
    private readonly mapsRepository: MapsRepository,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Создает карту только для существующего пользователя-владельца.
   *
   * Предварительная проверка нужна, чтобы API возвращал понятный `404`,
   * а не внутреннюю MySQL-ошибку foreign key constraint.
   */
  async create(dto: CreateMapDto): Promise<MapRecord> {
    await this.usersService.findById(dto.ownerUserId);

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

  async update(
    id: number,
    dto: UpdateMapDto,
    actorUserId?: number,
  ): Promise<MapRecord> {
    const map = await this.mapsRepository.update(id, dto, actorUserId);

    if (!map) {
      throw new NotFoundException(`Карта ${id} не найдена`);
    }

    return map;
  }

  async delete(id: number, actorUserId?: number): Promise<{ deleted: true }> {
    let deleted: boolean;

    try {
      deleted = await this.mapsRepository.delete(id, actorUserId);
    } catch (error) {
      if (isMysqlForeignKeyReferencedError(error)) {
        throw new ConflictException(
          `Карта ${id} связана с заказами и не может быть удалена`,
        );
      }

      throw error;
    }

    if (!deleted) {
      throw new NotFoundException(`Карта ${id} не найдена`);
    }

    return { deleted: true };
  }

  async restore(id: number, actorUserId?: number): Promise<{ restored: true }> {
    if (!(await this.mapsRepository.restore(id, actorUserId)))
      throw new NotFoundException(
        `Карта ${id} не найдена или уже восстановлена`,
      );
    return { restored: true };
  }
}
