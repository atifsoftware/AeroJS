# Advanced Security

### TOTP 2FA
```ts
const { secret, uri } = Totp.generateSecret();
const isValid = Totp.verify('123456', secret, { window: 1 });
```

### Env Vault
Encrypt your `.env` securely for production:
```bash
aerojs env:encrypt
```
