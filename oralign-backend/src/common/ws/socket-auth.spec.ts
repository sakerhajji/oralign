import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import type { Socket } from 'socket.io';
import type { PrismaService } from '../../prisma/prisma.service';

const SECRET = 'socket-auth-spec-secret';
process.env.JWT_SECRET = SECRET;

// Loaded after JWT_SECRET is set: SocketAuth reads it at construction.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SocketAuth } = require('./socket-auth') as typeof import('./socket-auth');

const signer = new JwtService({ secret: SECRET });
const sign = (payload: object, expiresIn: '15m' | '2m' = '15m') =>
  signer.sign(payload, { expiresIn });

interface FakeSocket {
  socket: Socket;
  emitted: Array<[string, unknown]>;
  disconnected: boolean;
}

function fakeSocket(opts: { auth?: Record<string, unknown>; authorization?: string } = {}): FakeSocket {
  const state: FakeSocket = { socket: undefined as unknown as Socket, emitted: [], disconnected: false };
  const listeners: Record<string, Array<() => void>> = {};
  state.socket = {
    handshake: { auth: opts.auth ?? {}, headers: { authorization: opts.authorization } },
    data: {},
    emit: (event: string, payload: unknown) => { state.emitted.push([event, payload]); return true; },
    disconnect: () => { state.disconnected = true; (listeners.disconnect ?? []).forEach((l) => l()); return state.socket; },
    once: (event: string, cb: () => void) => { (listeners[event] ??= []).push(cb); return state.socket; },
  } as unknown as Socket;
  return state;
}

function makeAuth(userRow: unknown) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(userRow) },
  } as unknown as PrismaService;
  return new SocketAuth(prisma);
}

const activeUser = { isActive: true, tokenVersion: 2, deletedAt: null };
const validClaims = { sub: 'u1', role: UserRole.dentist, tv: 2 };

describe('SocketAuth.authenticate - the ONE Socket.IO handshake rule', () => {
  afterEach(() => jest.useRealTimers());

  it('accepts a valid token, attaches the typed principal and keeps the socket open', async () => {
    const s = fakeSocket({ auth: { token: sign(validClaims) } });
    const principal = await makeAuth(activeUser).authenticate(s.socket, 'spec');
    expect(principal).toEqual({ userId: 'u1', role: UserRole.dentist });
    expect(SocketAuth.user(s.socket)).toEqual(principal);
    expect(s.disconnected).toBe(false);
    expect(s.emitted).toEqual([]);
  });

  it('also accepts the token from an Authorization: Bearer header', async () => {
    const s = fakeSocket({ authorization: `Bearer ${sign(validClaims)}` });
    await expect(makeAuth(activeUser).authenticate(s.socket, 'spec')).resolves.toEqual({
      userId: 'u1',
      role: UserRole.dentist,
    });
  });

  it.each([
    ['no token', {}, 'No auth token'],
    ['garbage token', { auth: { token: 'not-a-jwt' } }, 'Invalid auth'],
    ['token signed with another secret', { auth: { token: new JwtService({ secret: 'other' }).sign(validClaims) } }, 'Invalid auth'],
    ['unknown role claim', { auth: { token: sign({ ...validClaims, role: 'root' }) } }, 'Invalid auth'],
  ])('rejects %s: emits error + disconnects', async (_label, opts, message) => {
    const s = fakeSocket(opts as { auth?: Record<string, unknown> });
    const principal = await makeAuth(activeUser).authenticate(s.socket, 'spec');
    expect(principal).toBeNull();
    expect(s.disconnected).toBe(true);
    expect(s.emitted).toEqual([['error', { message }]]);
    expect(SocketAuth.user(s.socket)).toBeUndefined();
  });

  it.each([
    ['unknown user', null],
    ['deactivated user', { ...activeUser, isActive: false }],
    ['soft-deleted user', { ...activeUser, deletedAt: new Date() }],
  ])('rejects a %s with "Account is not active"', async (_label, row) => {
    const s = fakeSocket({ auth: { token: sign(validClaims) } });
    await makeAuth(row).authenticate(s.socket, 'spec');
    expect(s.emitted).toEqual([['error', { message: 'Account is not active' }]]);
    expect(s.disconnected).toBe(true);
  });

  it('rejects a token issued before a tokenVersion bump (password reset / admin revoke)', async () => {
    const s = fakeSocket({ auth: { token: sign({ ...validClaims, tv: 1 }) } });
    await makeAuth({ ...activeUser, tokenVersion: 2 }).authenticate(s.socket, 'spec');
    expect(s.emitted).toEqual([['error', { message: 'Session revoked' }]]);
  });

  it('treats a missing tv claim as version 0', async () => {
    const s = fakeSocket({ auth: { token: sign({ sub: 'u1', role: UserRole.dentist }) } });
    await expect(makeAuth({ ...activeUser, tokenVersion: 0 }).authenticate(s.socket, 'spec')).resolves.not.toBeNull();
  });

  it('caps the socket life at the token expiry (forces a reconnect with a fresh token)', async () => {
    jest.useFakeTimers({ now: new Date('2026-08-16T12:00:00Z') });
    const s = fakeSocket({ auth: { token: sign(validClaims, '2m') } });
    await makeAuth(activeUser).authenticate(s.socket, 'spec');
    expect(s.disconnected).toBe(false);
    jest.advanceTimersByTime(2 * 60 * 1000 + 50);
    expect(s.disconnected).toBe(true);
  });
});
