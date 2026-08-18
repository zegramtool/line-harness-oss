import { encodeBase64Url, decodeBase64Url } from '@block65/webcrypto-web-push/base64';

export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = (await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign'],
  )) as CryptoKeyPair
  const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey
  if (!jwk.x || !jwk.y || !jwk.d) {
    throw new Error('VAPID JWK is missing x/y/d')
  }
  const x = new Uint8Array(decodeBase64Url(jwk.x))
  const y = new Uint8Array(decodeBase64Url(jwk.y))
  const uncompressed = new Uint8Array(65)
  uncompressed[0] = 0x04
  uncompressed.set(x, 1)
  uncompressed.set(y, 33)
  return {
    publicKey: encodeBase64Url(uncompressed.buffer),
    privateKey: jwk.d,
  }
}

export function vapidPublicKeyBytes(publicKey: string): Uint8Array {
  return new Uint8Array(decodeBase64Url(publicKey));
}
