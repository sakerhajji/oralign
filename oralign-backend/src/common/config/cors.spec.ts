import { ForbiddenException } from '../exceptions/app.exception';
import { allowedOrigins, checkOrigin, expandOriginEquivalents } from './cors';

describe('CORS allowlist', () => {
  it('admits the www and bare forms of a public origin', () => {
    expect(expandOriginEquivalents('https://oralign.com.tn')).toEqual([
      'https://oralign.com.tn',
      'https://www.oralign.com.tn',
    ]);
    expect(expandOriginEquivalents('https://www.oralign.com.tn:8443')).toEqual([
      'https://oralign.com.tn:8443',
      'https://www.oralign.com.tn:8443',
    ]);
  });

  it('admits every loopback spelling of a dev origin', () => {
    expect(expandOriginEquivalents('http://localhost:3001')).toEqual([
      'http://localhost:3001',
      'http://127.0.0.1:3001',
      'http://[::1]:3001',
    ]);
  });

  it('leaves an unparsable origin alone', () => {
    expect(expandOriginEquivalents('not a url')).toEqual(['not a url']);
  });

  it('allows requests without an Origin and refuses unknown origins with a 403', () => {
    const allow = jest.fn();
    checkOrigin(undefined, allow);
    expect(allow).toHaveBeenCalledWith(null, true);

    const known = jest.fn();
    checkOrigin(allowedOrigins[0], known);
    expect(known).toHaveBeenCalledWith(null, true);

    const refuse = jest.fn();
    checkOrigin('https://evil.example', refuse);
    const [err] = refuse.mock.calls[0] as [unknown];
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).statusCode).toBe(403);
  });
});
