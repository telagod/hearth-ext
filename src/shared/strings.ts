/**
 * UI string table — Chinese is the source of truth; English is the same
 * key set in English. Adding a new key must touch both tables (compiler
 * enforces this via the StringKey union derived from the zh dict).
 */

export type StringKey =
  | 'app_name' | 'app_tagline'
  | 'tab_library' | 'tab_chat' | 'tab_inbox' | 'tab_skills' | 'tab_settings'
  | 'library_search_ph' | 'library_empty_title' | 'library_empty_hint'
  | 'library_today' | 'library_yesterday' | 'library_filter_by_tag'
  | 'drop_trigger' | 'drop_hint' | 'drop_too_large'
  | 'chat_empty_title' | 'chat_empty_hint' | 'chat_input_ph' | 'chat_input_ph_disabled'
  | 'chat_no_llm' | 'chat_no_consent' | 'chat_add_context' | 'chat_pick_prompt' | 'chat_pick_empty'
  | 'inbox_empty_title' | 'inbox_empty_hint' | 'inbox_promote' | 'inbox_discard'
  | 'skills_empty_title' | 'skills_empty_hint' | 'skill_new' | 'skill_edit' | 'skill_run_manual'
  | 'skill_toggle_enabled' | 'skill_toggle_disabled'
  | 'skill_status_succeeded' | 'skill_status_running' | 'skill_status_failed' | 'skill_status_cancelled'
  | 'skill_no_runs' | 'skill_not_run'
  | 'skill_editor_title_new' | 'skill_editor_title_edit'
  | 'skill_editor_cancel' | 'skill_editor_dryrun' | 'skill_editor_save'
  | 'skill_editor_ok' | 'skill_editor_err' | 'skill_completion_hint'
  | 'settings_llm' | 'settings_llm_hint' | 'settings_provider' | 'settings_provider_none'
  | 'settings_api_key' | 'settings_model' | 'settings_endpoint'
  | 'settings_privacy' | 'settings_privacy_hint'
  | 'settings_consent_ok' | 'settings_consent_stale' | 'settings_consent_grant' | 'settings_consent_revoke'
  | 'settings_toggle_recall' | 'settings_toggle_warmth' | 'settings_toggle_clipboard'
  | 'settings_ledger' | 'settings_ledger_hint' | 'settings_ledger_loading' | 'settings_ledger_empty'
  | 'settings_data' | 'settings_data_hint'
  | 'settings_export_zip' | 'settings_export_obsidian' | 'settings_export_json'
  | 'settings_save' | 'settings_saved'
  | 'settings_language' | 'settings_lang_zh' | 'settings_lang_en'
  | 'bar_save' | 'bar_ask' | 'bar_link' | 'bar_note' | 'bar_saved_toast'
  | 'bar_recall_lead' | 'bar_recall_open' | 'bar_recall_snooze' | 'bar_recall_n_related'
  | 'loading' | 'units_time_sec' | 'units_time_min' | 'units_time_hour' | 'units_time_day';

type Dict = Record<StringKey, string>;

const zh: Dict = {
  // Brand / chrome
  app_name: 'Hearth',
  app_tagline: '你读过的，都被静静记着',

  // Tabs
  tab_library: '库',
  tab_chat: '对话',
  tab_inbox: '收件箱',
  tab_skills: 'Skills',
  tab_settings: '设置',

  // Library
  library_search_ph: '搜索你的知识库……',
  library_empty_title: '炉膛还冷。',
  library_empty_hint: '在任意页面选中文字 → 浮 bar 点保存，第一段记忆就会落在这里。',
  library_today: '今天',
  library_yesterday: '昨天',
  library_filter_by_tag: '过滤 tag:',

  // DropZone
  drop_trigger: '拖入文件 / 点击选择',
  drop_hint: 'docx · pdf · 图片 · md · txt',
  drop_too_large: '文件太大 (> {limit} MB)',

  // Chat
  chat_empty_title: '围炉而坐，问点什么吧。',
  chat_empty_hint: '它会以你库内笔记为上下文，引用你自己说过的话。',
  chat_input_ph: '继续问，或拖一段笔记进来…',
  chat_input_ph_disabled: '请先在 Settings 配置 LLM …',
  chat_no_llm: '请先在「设置」里配置 LLM 提供商（Anthropic / OpenAI / Ollama）。',
  chat_no_consent: '需要先确认一次「外部 LLM 调用」（24 小时一次）。点 Settings → 隐私 → 我同意。',
  chat_add_context: '加笔记上下文',
  chat_pick_prompt: '选一段笔记作上下文（输入序号）：',
  chat_pick_empty: '库里还没有笔记可作上下文。',

  // Inbox
  inbox_empty_title: 'Inbox 空了 — 没人在敲门。',
  inbox_empty_hint: '候选会从复制 / 深度阅读 / 截图自动产生。',
  inbox_promote: '入库为笔记',
  inbox_discard: '丢弃',

  // Skills
  skills_empty_title: 'Skills 还没加载。',
  skills_empty_hint: '重启扩展，启动后 5 个内置 skill 会自动入库。',
  skill_new: '新建 skill',
  skill_edit: '编辑',
  skill_run_manual: '手动运行',
  skill_toggle_enabled: '已启用 (点击禁用)',
  skill_toggle_disabled: '已禁用 (点击启用)',
  skill_status_succeeded: '成功',
  skill_status_running: '运行中',
  skill_status_failed: '失败',
  skill_status_cancelled: '取消',
  skill_no_runs: '无运行记录',
  skill_not_run: '尚未运行',
  skill_editor_title_new: '新建 skill',
  skill_editor_title_edit: '编辑 · {name}',
  skill_editor_cancel: '取消',
  skill_editor_dryrun: '干跑',
  skill_editor_save: '保存',
  skill_editor_ok: 'OK · {steps} 步 · {tools} 个工具',
  skill_editor_err: '{n} 错误',
  skill_completion_hint: '↑↓ 选择 · ⏎/Tab 确认 · Esc 取消',

  // Settings
  settings_llm: 'LLM 提供商',
  settings_llm_hint: '所有外部调用都需要你 BYO API key — Hearth 不持有任何凭据。',
  settings_provider: 'Provider',
  settings_provider_none: '不启用 (纯本地)',
  settings_api_key: 'API Key',
  settings_model: 'Model',
  settings_endpoint: 'Endpoint',
  settings_privacy: '隐私与同意',
  settings_privacy_hint: '云端 LLM 调用需要你 24 小时内点过一次「同意」。本地 Ollama 不需要。',
  settings_consent_ok: '同意有效 · {h}h 后过期',
  settings_consent_stale: '未同意 / 已过期',
  settings_consent_grant: '我同意 (24h)',
  settings_consent_revoke: '撤销',
  settings_toggle_recall: '启用反向召回小球（L2，浏览页面时若命中则浮现）',
  settings_toggle_warmth: '用 LLM 写温度旁白（关闭则用纯统计句子）',
  settings_toggle_clipboard: '监听剪贴板复制（L0 候选）',
  settings_ledger: '过去 7 天云端调用',
  settings_ledger_hint: '每一次外部调用都被本地审计。这里看得见。',
  settings_ledger_loading: '加载中…',
  settings_ledger_empty: '过去 7 天没有任何云端调用。',
  settings_data: '数据',
  settings_data_hint: '所有数据存在本机 OPFS — 完整库可一键导出，永远不离开你这台设备。',
  settings_export_zip: '完整 ZIP',
  settings_export_obsidian: 'Obsidian Vault',
  settings_export_json: 'JSON 单文件',
  settings_save: '保存设置',
  settings_saved: '已保存',
  settings_language: '界面语言',
  settings_lang_zh: '中文',
  settings_lang_en: 'English',

  // Float bar (content script)
  bar_save: '保存',
  bar_ask: '问 AI',
  bar_link: '关联',
  bar_note: '批注',
  bar_saved_toast: '已收进 Hearth',
  bar_recall_lead: 'Hearth 想起来了',
  bar_recall_open: '去看那段',
  bar_recall_snooze: '稍后',
  bar_recall_n_related: '你库内有 {n} 段相关旧笔记。',

  // Misc
  loading: '加载中…',
  units_time_sec: '{n}s 前',
  units_time_min: '{n}m 前',
  units_time_hour: '{n}h 前',
  units_time_day: '{n}d 前',
};

const en: Dict = {
  app_name: 'Hearth',
  app_tagline: 'Your reading, remembered. Quietly.',

  tab_library: 'Library',
  tab_chat: 'Chat',
  tab_inbox: 'Inbox',
  tab_skills: 'Skills',
  tab_settings: 'Settings',

  library_search_ph: 'Search your library…',
  library_empty_title: 'The hearth is cold.',
  library_empty_hint: 'Select text on any page → click the save button in the float bar. Your first memory lands here.',
  library_today: 'Today',
  library_yesterday: 'Yesterday',
  library_filter_by_tag: 'Filter by tag:',

  drop_trigger: 'Drop files / click to choose',
  drop_hint: 'docx · pdf · image · md · txt',
  drop_too_large: 'File too large (> {limit} MB)',

  chat_empty_title: 'Pull up a chair. Ask away.',
  chat_empty_hint: 'It uses your notes as context and quotes your own words back.',
  chat_input_ph: 'Ask, or drag a note in…',
  chat_input_ph_disabled: 'Configure an LLM in Settings first…',
  chat_no_llm: 'Please set up an LLM provider (Anthropic / OpenAI / Ollama) in Settings.',
  chat_no_consent: 'You need to confirm "external LLM call" once per 24h. Settings → Privacy → I agree.',
  chat_add_context: 'Add note context',
  chat_pick_prompt: 'Pick a note as context (enter number):',
  chat_pick_empty: 'No notes in library yet to use as context.',

  inbox_empty_title: 'Inbox is empty — nobody knocking.',
  inbox_empty_hint: 'Candidates come from clipboard / deep-read / screenshots automatically.',
  inbox_promote: 'Promote to note',
  inbox_discard: 'Discard',

  skills_empty_title: 'No skills loaded yet.',
  skills_empty_hint: 'Reload the extension — five built-in skills will appear after boot.',
  skill_new: 'New skill',
  skill_edit: 'Edit',
  skill_run_manual: 'Run manually',
  skill_toggle_enabled: 'Enabled (click to disable)',
  skill_toggle_disabled: 'Disabled (click to enable)',
  skill_status_succeeded: 'OK',
  skill_status_running: 'running',
  skill_status_failed: 'failed',
  skill_status_cancelled: 'cancelled',
  skill_no_runs: 'No runs yet',
  skill_not_run: 'Never run',
  skill_editor_title_new: 'New skill',
  skill_editor_title_edit: 'Edit · {name}',
  skill_editor_cancel: 'Cancel',
  skill_editor_dryrun: 'Dry-run',
  skill_editor_save: 'Save',
  skill_editor_ok: 'OK · {steps} steps · {tools} tools',
  skill_editor_err: '{n} errors',
  skill_completion_hint: '↑↓ select · ⏎/Tab confirm · Esc cancel',

  settings_llm: 'LLM Provider',
  settings_llm_hint: 'All outbound calls require your own API key — Hearth never holds credentials.',
  settings_provider: 'Provider',
  settings_provider_none: 'Off (local-only)',
  settings_api_key: 'API Key',
  settings_model: 'Model',
  settings_endpoint: 'Endpoint',
  settings_privacy: 'Privacy & Consent',
  settings_privacy_hint: 'Cloud LLM calls require a "I agree" confirmation every 24h. Local Ollama is exempt.',
  settings_consent_ok: 'Consent valid · expires in {h}h',
  settings_consent_stale: 'No / expired consent',
  settings_consent_grant: 'I agree (24h)',
  settings_consent_revoke: 'Revoke',
  settings_toggle_recall: 'Enable reverse recall orb (L2 — appears on pages when notes match)',
  settings_toggle_warmth: 'Use LLM to write the warmth narrative (off = plain stats line)',
  settings_toggle_clipboard: 'Listen for clipboard copies (L0 candidate)',
  settings_ledger: 'Past 7 days cloud calls',
  settings_ledger_hint: 'Every outbound call is audited locally. Visible here.',
  settings_ledger_loading: 'Loading…',
  settings_ledger_empty: 'No cloud calls in the past 7 days.',
  settings_data: 'Data',
  settings_data_hint: 'Everything lives in your local OPFS — one-click export, never leaves this device.',
  settings_export_zip: 'Full ZIP',
  settings_export_obsidian: 'Obsidian Vault',
  settings_export_json: 'Single JSON',
  settings_save: 'Save settings',
  settings_saved: 'Saved',
  settings_language: 'Interface language',
  settings_lang_zh: '中文',
  settings_lang_en: 'English',

  bar_save: 'Save',
  bar_ask: 'Ask AI',
  bar_link: 'Link',
  bar_note: 'Note',
  bar_saved_toast: 'Saved to Hearth',
  bar_recall_lead: 'Hearth remembers',
  bar_recall_open: 'See that note',
  bar_recall_snooze: 'Later',
  bar_recall_n_related: 'You have {n} related notes.',

  loading: 'Loading…',
  units_time_sec: '{n}s ago',
  units_time_min: '{n}m ago',
  units_time_hour: '{n}h ago',
  units_time_day: '{n}d ago',
};

export const translations: Record<'zh' | 'en', Dict> = { zh, en };
