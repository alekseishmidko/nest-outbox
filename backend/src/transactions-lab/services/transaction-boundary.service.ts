import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../database/unit-of-work';
import { MapsRepository } from '../../maps/repositories/maps.repository';
import { CreateMapDto } from '../../maps/dto/create-map.dto';
import { UsersRepository } from '../../users/repositories/users.repository';
import { CreateUserDto } from '../../users/dto/create-user.dto';

/** Результат одной бизнес-операции, затрагивающей users и maps. */
export type UserMapProvisioningResult = {
  userId: number;
  mapId: number;
};

/**
 * Пример service-границы транзакции для нескольких repository.
 *
 * Controller здесь отсутствует намеренно: Unit of Work принадлежит service,
 * а repository получают только переданное transaction connection.
 */
@Injectable()
export class TransactionBoundaryService {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly usersRepository: UsersRepository,
    private readonly mapsRepository: MapsRepository,
  ) {}

  /**
   * Создает пользователя и его карту одной атомарной бизнес-операцией.
   *
   * @param user Пользователь для создания.
   * @param map Карта, владелец которой равен созданному пользователю.
   * @returns Идентификаторы созданных пользователя и карты.
   * @throws Ошибку SQL или callback; все изменения откатываются при ошибке.
   */
  async provisionUserAndMap(
    user: CreateUserDto,
    map: Omit<CreateMapDto, 'ownerUserId'>,
  ): Promise<UserMapProvisioningResult> {
    return this.unitOfWork.run(async (connection) => {
      const createdUser = await this.usersRepository.createInTransaction(
        connection,
        user,
      );
      const createdMap = await this.mapsRepository.createInTransaction(
        connection,
        { ...map, ownerUserId: createdUser.id },
      );
      return { userId: createdUser.id, mapId: createdMap.id };
    });
  }
}
