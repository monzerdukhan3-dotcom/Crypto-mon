import { formatPrice } from "./format";
import { detectTrend } from "./trend";
import type { Candle, Zone } from "./types";

const STRENGTH_LABEL_AR: Record<Zone["strength"], string> = {
  strong: "قوية",
  medium: "متوسطة",
  weak: "ضعيفة",
};

function describeTrend(candles: Candle[]): string {
  const trend = detectTrend(candles);
  if (trend === "up") return "الاتجاه العام للسعر صاعد خلال الفترة المعروضة";
  if (trend === "down") return "الاتجاه العام للسعر هابط خلال الفترة المعروضة";
  return "الاتجاه العام للسعر متذبذب (عرضي) خلال الفترة المعروضة";
}

function describeStrongestZone(zones: Zone[]): { zone: Zone; sentence: string } | null {
  const activeZones = zones.filter((z) => z.active);
  if (activeZones.length === 0) return null;

  const strongest = activeZones.reduce((best, z) => (z.strengthScore > best.strengthScore ? z : best));
  const typeLabel = strongest.type === "demand" ? "طلب" : "عرض";

  const reasonParts: string[] = [];
  if (strongest.impulseMoveAtr >= 3) reasonParts.push("حركة اندفاعية قوية جدًا بعدها");
  else if (strongest.impulseMoveAtr >= 1.5) reasonParts.push("حركة اندفاعية جيدة بعدها");
  else reasonParts.push("حركة اندفاعية بعدها");

  if (strongest.testCount === 0) reasonParts.push("ولم يتم اختبارها بعد");
  else if (strongest.testCount === 1) reasonParts.push("واختُبرت مرة واحدة فقط حتى الآن");
  else if (strongest.testCount === 2) reasonParts.push("واختُبرت مرتين فقط حتى الآن");
  else reasonParts.push(`لكنها اختُبرت ${strongest.testCount} مرات حتى الآن`);

  const sentence = `أقوى منطقة نشطة حاليًا هي منطقة ${typeLabel} عند ${formatPrice(strongest.bottom)}–${formatPrice(strongest.top)} صُنّفت ${STRENGTH_LABEL_AR[strongest.strength]} بسبب ${reasonParts.join(" ")}`;

  return { zone: strongest, sentence };
}

function describePricePosition(currentPrice: number, zone: Zone): string {
  if (currentPrice >= zone.bottom && currentPrice <= zone.top) {
    return "والسعر الحالي يقع داخل هذه المنطقة الآن.";
  }
  const isAbove = currentPrice > zone.top;
  const reference = isAbove ? zone.top : zone.bottom;
  const distancePct = (Math.abs(currentPrice - reference) / reference) * 100;
  return `والسعر الحالي ${isAbove ? "أعلى" : "أسفل"} هذه المنطقة بمسافة تقارب ${distancePct.toFixed(1)}%.`;
}

/** Generates a short (2-3 sentence) Arabic summary of trend, the strongest active zone, and price's position relative to it. */
export function generateTechnicalSummary(candles: Candle[], zones: Zone[], currentPrice: number): string {
  if (candles.length < 2) return "لا تتوفر بيانات كافية لإجراء تحليل فني حاليًا.";

  const trendSentence = describeTrend(candles);
  const strongest = describeStrongestZone(zones);

  if (!strongest) {
    return `${trendSentence}. لم يتم رصد مناطق عرض أو طلب نشطة واضحة حتى الآن ضمن النطاق المعروض.`;
  }

  const positionSentence = describePricePosition(currentPrice, strongest.zone);

  return `${trendSentence}. ${strongest.sentence}. ${positionSentence}`;
}
