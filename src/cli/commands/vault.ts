/**
 * @file vault.ts
 * @description CLI commands for AeroJS Environment Vault.
 */

import * as fs from 'node:fs';
import { EnvVault } from '../../security/vault.js';

export function encryptEnv() {
  const key = EnvVault.generateKey();
  console.log(`\n🔑 Generated AERO_KEY: ${key}`);
  console.log(`Keep this key secret and inject it into your production environment.\n`);

  try {
    EnvVault.syncToVault('.env', '.env.vault', key);
    console.log('✅ Successfully encrypted .env to .env.vault');
  } catch (err: any) {
    console.error('❌ Failed to encrypt:', err.message);
  }
}

export function decryptEnv() {
  const key = process.env['AERO_KEY'] || process.env['DOTENV_PRIVATE_KEY'];
  if (!key) {
    console.error('❌ AERO_KEY environment variable is missing.');
    return;
  }

  try {
    const vaultContent = fs.readFileSync('.env.vault', 'utf8');
    const match = vaultContent.match(/AERO_VAULT="([^"]+)"/);
    if (!match || !match[1]) {
      throw new Error('Invalid .env.vault format.');
    }
    const decrypted = EnvVault.decrypt(match[1], key);
    fs.writeFileSync('.env.decrypted', decrypted);
    console.log('✅ Successfully decrypted .env.vault to .env.decrypted');
  } catch (err: any) {
    console.error('❌ Failed to decrypt:', err.message);
  }
}
