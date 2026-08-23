import { DomainEvent } from './domain-event';

export class MediaGenerated {
  readonly name = 'MediaGenerated' as const;
  readonly aggregateType = 'media' as const;
  readonly occurredAt = new Date();

  constructor(
    readonly assetId: number,
    readonly ownerType: 'user' | 'map' | 'order',
    readonly ownerId: number,
    readonly mediaType: 'avatar' | 'qr_code',
  ) {}

  toDomainEvent(): DomainEvent {
    return {
      name: this.name,
      aggregateType: this.aggregateType,
      aggregateId: this.assetId,
      occurredAt: this.occurredAt,
      payload: {
        assetId: this.assetId,
        ownerType: this.ownerType,
        ownerId: this.ownerId,
        type: this.mediaType,
      },
    };
  }
}
