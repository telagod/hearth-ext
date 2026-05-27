/**
 * Warmth Engine — turn statistical recall into a one-sentence companion line.
 *
 * Privacy contract: input to LLM is *intentionally minimal*:
 *   - current page title (+ site)
 *   - candidate titles + brief excerpts + user annotations (if any)
 *
 * Never the full body of either current page or candidates.
 */

import type { RecallCard } from '@shared/types';
import {
  createAdapter,
  type LLMConfig,
  type LLMMessage,
  type LLMResponse,
} from './adapter';

export interface WarmthInput {
  page_title: string;
  page_site?: string;
  candidates: Array<Pick<RecallCard, 'title' | 'excerpt' | 'user_annotation' | 'created_at'>>;
  user_lang: 'zh' | 'en';
}

export interface WarmthOutput {
  narrative: string;
  used: number;            // how many candidates we actually fed in
  llm: LLMResponse | null;
}

const SYS_ZH = `你是 Hearth，用户的本地知识管家。
说话短、有温度，像在火炉边轻声提醒。

风格规则：
- 用"你"，不要"用户"
- 不要列表，写成 1-2 句话，全句不超过 70 字
- 如候选笔记里有用户原话批注，引用一句（用引号）
- 不要恭维，不要"很好的问题/很有意思"开头
- 不要说"根据..."、"我注意到..."、"看起来..."
- 直接说事实：你某时候读过 X，当时你说过 Y
- 输出纯文本，不要 markdown 标题或列表`;

const SYS_EN = `You are Hearth — the user's local knowledge keeper.
Speak softly, like a friend by a fireplace.

Style rules:
- Address the user as "you"
- No bullet lists. One or two short sentences, under 30 words total.
- If a candidate carries the user's own annotation, quote one fragment.
- No flattery, no "great question", no "I noticed..."
- State the fact: you read X back then, you wrote Z.
- Plain text only, no markdown headings or lists.`;

export function buildPrompt(input: WarmthInput): { system: string; user: string } {
  const system = input.user_lang === 'zh' ? SYS_ZH : SYS_EN;
  const lines: string[] = [];
  lines.push(`【当前页】${input.page_title}${input.page_site ? ` · ${input.page_site}` : ''}`);
  lines.push('【候选旧笔记】');
  input.candidates.slice(0, 3).forEach((c, i) => {
    const date = new Date(c.created_at * 1000).toISOString().slice(0, 10);
    lines.push(`${i + 1}. [${date}] ${c.title} — ${c.excerpt.slice(0, 90)}`);
    if (c.user_annotation) {
      lines.push(`   你当时写：${c.user_annotation.slice(0, 120)}`);
    }
  });
  return { system, user: lines.join('\n') };
}

export function bytesOf(prompt: { system: string; user: string }): number {
  return new TextEncoder().encode(prompt.system + prompt.user).length;
}

/**
 * Compose a narrative for the current page. If LLM unavailable, fall back to
 * a deterministic plain-statistics line — Hearth always has something to say.
 */
export async function narrate(input: WarmthInput, cfg: LLMConfig | null): Promise<WarmthOutput> {
  const candidates = input.candidates.slice(0, 3);
  if (candidates.length === 0) {
    return { narrative: '', used: 0, llm: null };
  }
  if (!cfg || cfg.provider === ('none' as never)) {
    return { narrative: fallbackNarrative(input, candidates), used: candidates.length, llm: null };
  }
  try {
    const adapter = await createAdapter(cfg);
    const prompt = buildPrompt(input);
    const messages: LLMMessage[] = [
      { role: 'system', content: prompt.system },
      { role: 'user',   content: prompt.user },
    ];
    const r = await adapter.complete({
      purpose: 'warmth',
      messages,
      max_tokens: 160,
      temperature: 0.7,
    });
    const text = r.content.trim().replace(/^["'「]+|["'」]+$/g, '');
    if (!text) {
      return { narrative: fallbackNarrative(input, candidates), used: candidates.length, llm: r };
    }
    return { narrative: text, used: candidates.length, llm: r };
  } catch (e) {
    console.warn('[hearth/warmth] LLM call failed, fallback used', e);
    return { narrative: fallbackNarrative(input, candidates), used: candidates.length, llm: null };
  }
}

function fallbackNarrative(
  input: WarmthInput,
  candidates: WarmthInput['candidates'],
): string {
  const isZh = input.user_lang === 'zh';
  const n = candidates.length;
  if (isZh) {
    const date = relativeDateZh(candidates[0]!.created_at);
    return `你${date}读过相关的 ${n} 段笔记，要看看吗？`;
  }
  return `You have ${n} related notes from ${relativeDateEn(candidates[0]!.created_at)}. Take a look?`;
}

function relativeDateZh(ts: number): string {
  const days = Math.max(1, Math.round((Date.now() / 1000 - ts) / 86400));
  if (days < 7) return `${days} 天前`;
  if (days < 60) return `约 ${Math.round(days / 7)} 周前`;
  if (days < 365) return `约 ${Math.round(days / 30)} 个月前`;
  return `约 ${Math.round(days / 365)} 年前`;
}

function relativeDateEn(ts: number): string {
  const days = Math.max(1, Math.round((Date.now() / 1000 - ts) / 86400));
  if (days < 7) return `${days}d ago`;
  if (days < 60) return `${Math.round(days / 7)}w ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}
