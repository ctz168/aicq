import * as crypto from '../../shared/crypto/dist';

// Test 1: Generate key pairs
const signingKeys = crypto.generateSigningKeyPair();
console.log('Signing keys generated:', !!signingKeys.publicKey, !!signingKeys.secretKey);

// Test 2: Sign and verify
const message = crypto.decodeUTF8('Hello AICQ!');
const signature = crypto.sign(message, signingKeys.secretKey);
const valid = crypto.verify(message, signature, signingKeys.publicKey);
console.log('Signature valid:', valid);

// Test 3: Key exchange
const aliceKeys = crypto.generateKeyExchangeKeyPair();
const bobKeys = crypto.generateKeyExchangeKeyPair();
const aliceShared = crypto.computeSharedSecret(aliceKeys.secretKey, bobKeys.publicKey);
const bobShared = crypto.computeSharedSecret(bobKeys.secretKey, aliceKeys.publicKey);
const keysMatch = aliceShared.every((v, i) => v === bobShared[i]);
console.log('Key exchange match:', keysMatch);

// Test 4: Session key derivation
const sessionKey1 = crypto.deriveSessionKey(aliceShared);
const sessionKey2 = crypto.deriveSessionKey(bobShared);
const sessionMatch = sessionKey1.every((v, i) => v === sessionKey2[i]);
console.log('Session key match:', sessionMatch);

// Test 5: Encrypt and decrypt
const nonce = crypto.generateNonce();
const encrypted = crypto.encrypt(message, sessionKey1);
const decrypted = crypto.decrypt(encrypted.ciphertext, sessionKey2, encrypted.nonce);
const decryptMatch = crypto.encodeUTF8(decrypted!) === 'Hello AICQ!';
console.log('Encrypt/decrypt match:', decryptMatch);

// Test 6: Message format
const msgData = crypto.encryptMessage('Test message', sessionKey1, signingKeys.secretKey, signingKeys.publicKey);
const parsed = crypto.decryptMessage(msgData, sessionKey1, signingKeys.publicKey);
console.log('Message roundtrip:', parsed === 'Test message');

// Test 7: Password encryption
const encResult = crypto.encryptWithPassword(signingKeys.secretKey, 'mypassword123');
const decResult = crypto.decryptWithPassword(encResult.salt, encResult.iv, encResult.encrypted, 'mypassword123');
const pwdMatch = decResult && decResult.every((v, i) => v === signingKeys.secretKey[i]);
console.log('Password encrypt/decrypt:', pwdMatch);

// Test 8: Handshake protocol
const aliceIdKeys = crypto.generateSigningKeyPair();
const bobIdKeys = crypto.generateSigningKeyPair();
const aliceEphKeys = crypto.generateKeyExchangeKeyPair();
const bobEphKeys = crypto.generateKeyExchangeKeyPair();

const request = crypto.createHandshakeRequest(aliceIdKeys.publicKey, aliceEphKeys.publicKey);
const response = crypto.createHandshakeResponse(request, bobIdKeys, bobEphKeys);
const aliceSessionKey = crypto.completeHandshake(response, request, aliceIdKeys, aliceEphKeys);
const bobSessionKey = crypto.completeHandshake(response, request, bobIdKeys, bobEphKeys);
const handshakeMatch = aliceSessionKey.every((v, i) => v === bobSessionKey[i]);
console.log('Handshake key match:', handshakeMatch);

// Summary
const allPassed = valid && keysMatch && sessionMatch && decryptMatch && parsed === 'Test message' && pwdMatch && handshakeMatch;
console.log('\n=== CRYPTO INTEGRATION TEST ===');
console.log(allPassed ? 'ALL TESTS PASSED ✅' : 'SOME TESTS FAILED ❌');
process.exit(allPassed ? 0 : 1);
