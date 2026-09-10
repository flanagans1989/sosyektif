/**
 * Ortam değişkeni okuma yardımcıları. Eksik zorunlu bir değişken, ajanı
 * sessizce yarım çalıştırmak yerine net bir hata ile durdurur — bu sayede
 * "API anahtarı yok" durumu pipeline'da anlaşılır bir mesajla ortaya çıkar.
 */

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export function requireEnv(name: string): string {
  const value = optionalEnv(name);
  if (!value) {
    throw new Error(
      `Eksik ortam değişkeni: ${name}. agents/.env.example dosyasına bak ve ` +
        `GitHub Actions kullanıyorsan repo Secrets'a ekle.`
    );
  }
  return value;
}

export function hasEnv(name: string): boolean {
  return optionalEnv(name) !== undefined;
}
