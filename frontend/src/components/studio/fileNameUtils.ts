/** Export 시 .json 확장자 보장 (중복 부착 방지) */
export function ensureJsonFileName(name: string): string {
  const t = name.trim();
  if (!t) return 'New_Scenario.json';
  if (/\.json$/i.test(t)) return t;
  return `${t}.json`;
}
