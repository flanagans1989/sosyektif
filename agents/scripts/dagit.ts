/**
 * Dağıtım kuyruğunu bir kez işler (bkz. src/distribute/kuyruk.ts).
 * .github/workflows/dagitim.yml çalıştırır: pipeline bitince, Telegram
 * onayından sonra (Worker) ve saatlik zamanlayıcıyla.
 *
 * Kullanım: npm run dagit
 */
import { dagitimKuyrugunuIsle } from "../src/distribute/kuyruk.js";

const rapor = await dagitimKuyrugunuIsle();
console.log(
  `[dagitim] ${rapor.paylasilan.length} paylaşım, ${rapor.hatalar.length} hata, ${rapor.vazgecilen.length} vazgeçildi, kuyrukta ${rapor.kalanIcerik} içerik kaldı`
);
process.exit(0);
