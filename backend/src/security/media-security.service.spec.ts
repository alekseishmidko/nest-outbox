import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { MediaSecurityService } from './media-security.service';

describe('MediaSecurityService', () => {
  const service = new MediaSecurityService();

  it('rejects mismatched MIME/content and oversized payloads', () => {
    expect(() => service.validate(Buffer.from('<svg />'), 'image/png')).toThrow(
      BadRequestException,
    );
    expect(() =>
      service.validate(
        Buffer.from('<svg onload="alert(1)" />'),
        'image/svg+xml',
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      service.validate(Buffer.alloc(5 * 1024 * 1024 + 1), 'image/png'),
    ).toThrow(PayloadTooLargeException);
  });

  it('rejects traversal targets and antivirus test signature', () => {
    expect(() =>
      service.assertSafePath('/tmp/media', '/tmp/media/../secret'),
    ).toThrow(BadRequestException);
    expect(() =>
      service.validate(
        Buffer.from('<svg>EICAR-STANDARD-ANTIVIRUS-TEST-FILE</svg>'),
        'image/svg+xml',
      ),
    ).toThrow(BadRequestException);
  });
});
