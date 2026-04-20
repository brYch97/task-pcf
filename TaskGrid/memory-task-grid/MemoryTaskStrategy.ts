import {
    IAvailableColumnOptions,
    IAvailableRelatedColumn,
    IColumn,
    IDataProvider,
    IMemoryProviderEntityMetadata,
    IRawRecord,
    IRecord,
    IRecordSaveOperationResult,
} from "@talxis/client-libraries";
import {
    IDeleteTasksResult,
    IEditTasksResult,
    ITaskDataProvider,
    ITaskDataProviderStrategy,
} from "@talxis/base-controls/dist/components/TaskGrid/data-providers";
import { IRecordTree } from "@talxis/base-controls/dist/components/TaskGrid/data-providers/task-data-provider/record-tree";

// ─── Column names ─────────────────────────────────────────────────────────────

export const ENTITY_NAME = 'mem_task';
export const PRIMARY_ID = 'mem_taskid';
export const SUBJECT_COL = 'subject';
export const PARENT_ID_COL = 'parentid';
/** Raw OData key used in IRawRecord for the parentid lookup field. */
export const PARENT_ID_VALUE_KEY = `_${PARENT_ID_COL}_value`;
export const STACK_RANK_COL = 'stackrank';
export const PATH_COL = 'path';
export const STATE_CODE_COL = 'statecode';
export const PERCENT_COMPLETE_COL = 'percentcomplete';

// ─── Metadata ─────────────────────────────────────────────────────────────────

export const ENTITY_METADATA: IMemoryProviderEntityMetadata = {
    PrimaryIdAttribute: PRIMARY_ID,
    LogicalName: ENTITY_NAME,
    QuickFindColumns: [SUBJECT_COL],
};

// ─── Column definitions ───────────────────────────────────────────────────────

export const COLUMNS: IColumn[] = [
    {
        name: SUBJECT_COL,
        dataType: 'SingleLine.Text',
        displayName: 'Subject',
        isPrimary: true,
        visualSizeFactor: 300,
    },
    {
        name: 'description',
        dataType: 'Multiple',
        displayName: 'Description',
        visualSizeFactor: 300,
    },
    {
        name: 'statuscode',
        dataType: 'OptionSet',
        displayName: 'Status',
        visualSizeFactor: 145,
        metadata: {
            OptionSet: [
                { Value: 1, Label: 'Not Started', Color: '#808080' },
                { Value: 2, Label: 'In Progress', Color: '#0078d4' },
                { Value: 3, Label: 'Waiting', Color: '#f7a947' },
                { Value: 4, Label: 'Deferred', Color: '#8764b8' },
                { Value: 5, Label: 'Completed', Color: '#107c10' },
                { Value: 6, Label: 'Cancelled', Color: '#d13438' },
            ],
        },
    },
    {
        name: 'priority',
        dataType: 'OptionSet',
        displayName: 'Priority',
        visualSizeFactor: 120,
        metadata: {
            OptionSet: [
                { Value: 0, Label: 'Low', Color: '#69797e' },
                { Value: 1, Label: 'Normal', Color: '#0078d4' },
                { Value: 2, Label: 'High', Color: '#ff8c00' },
                { Value: 3, Label: 'Critical', Color: '#d13438' },
            ],
        },
    },
    {
        name: 'scheduledstart',
        dataType: 'DateAndTime.DateOnly',
        displayName: 'Start Date',
        visualSizeFactor: 130,
    },
    {
        name: 'scheduledend',
        dataType: 'DateAndTime.DateOnly',
        displayName: 'Due Date',
        visualSizeFactor: 130,
    },
    {
        name: 'estimatedeffort',
        dataType: 'Decimal',
        displayName: 'Est. Effort (h)',
        visualSizeFactor: 130,
    },
    {
        name: 'actualeffort',
        dataType: 'Decimal',
        displayName: 'Actual Effort (h)',
        visualSizeFactor: 130,
    },
    {
        name: PERCENT_COMPLETE_COL,
        dataType: 'Whole.None',
        displayName: '% Complete',
        visualSizeFactor: 115,
    },
    {
        name: 'assignedto',
        dataType: 'SingleLine.Text',
        displayName: 'Assigned To',
        visualSizeFactor: 150,
    },
    {
        name: 'tags',
        dataType: 'SingleLine.Text',
        displayName: 'Tags',
        visualSizeFactor: 200,
    },
    // ── Native (hidden) columns ──────────────────────────────────────────────
    { name: PRIMARY_ID, dataType: 'SingleLine.Text', displayName: 'ID', isHidden: true },
    { name: PARENT_ID_COL, dataType: 'Lookup.Simple', displayName: 'Parent', isHidden: true },
    { name: STACK_RANK_COL, dataType: 'SingleLine.Text', displayName: 'Stack Rank', isHidden: true },
    { name: STATE_CODE_COL, dataType: 'Whole.None', displayName: 'State', isHidden: true },
    { name: PATH_COL, dataType: 'SingleLine.Text', displayName: 'Path', isHidden: true, isVirtual: true },
];

// ─── Visible columns for the default system query ─────────────────────────────

export const DEFAULT_QUERY_COLUMNS: IColumn[] = COLUMNS.filter(c =>
    c.isHidden ||
    ['subject', 'statuscode', 'priority', 'scheduledend', 'estimatedeffort', 'percentcomplete', 'assignedto', 'tags'].includes(c.name)
);

// ─── LexoRank ─────────────────────────────────────────────────────────────────

const _ALPHA_SIZE = 26;
const _ALPHA_BASE = 'a'.charCodeAt(0);
export const LEXO_MIN = 'aaa';
export const LEXO_MAX = 'zzz';

/**
 * Returns a lexorank string lexicographically between lo and hi.
 * Both strings must satisfy lo < hi under string comparison.
 * If there is no room between them the lo string is extended with 'n'.
 */
export function lexoRankBetween(lo: string, hi: string): string {
    let a = lo, b = hi;
    while (a.length < b.length) a += 'a';
    while (b.length < a.length) b += 'a';

    const aCodes = Array.from(a).map(c => c.charCodeAt(0) - _ALPHA_BASE);
    const bCodes = Array.from(b).map(c => c.charCodeAt(0) - _ALPHA_BASE);

    let difference = 0;
    for (let i = aCodes.length - 1; i >= 0; i--) {
        let aCode = aCodes[i];
        let bCode = bCodes[i];
        if (bCode < aCode) {
            bCode += _ALPHA_SIZE;
            bCodes[i - 1] -= 1;
        }
        difference += (bCode - aCode) * Math.pow(_ALPHA_SIZE, a.length - i - 1);
    }

    if (difference <= 1) {
        return lo + 'n'; // extend — keeps sort order intact
    }

    difference = Math.floor(difference / 2);
    let result = '';
    let offset = 0;
    for (let i = 0; i < a.length; i++) {
        const diffInSymbols = Math.floor(difference / Math.pow(_ALPHA_SIZE, i)) % _ALPHA_SIZE;
        let newCode = a.charCodeAt(a.length - i - 1) - _ALPHA_BASE + diffInSymbols + offset;
        offset = 0;
        if (newCode >= _ALPHA_SIZE) {
            offset++;
            newCode -= _ALPHA_SIZE;
        }
        result += String.fromCharCode(_ALPHA_BASE + newCode);
    }
    return result.split('').reverse().join('');
}

/** Returns a rank before the given rank. */
export function lexoRankBefore(rank: string): string { return lexoRankBetween(LEXO_MIN, rank); }

/** Returns a rank after the given rank. */
export function lexoRankAfter(rank: string): string { return lexoRankBetween(rank, LEXO_MAX); }

/** Generates count evenly-spaced ranks between LEXO_MIN and LEXO_MAX. */
function _generateDefaultRanks(count: number): string[] {
    const diffInOneSymb = _ALPHA_SIZE - 1; // 25
    const totalDiff = diffInOneSymb + diffInOneSymb * _ALPHA_SIZE + diffInOneSymb * _ALPHA_SIZE * _ALPHA_SIZE;
    const step = Math.floor(totalDiff / (count + 1));
    const perSymbol = [
        step % _ALPHA_SIZE,
        Math.floor(step / _ALPHA_SIZE) % _ALPHA_SIZE,
        Math.floor(step / (_ALPHA_SIZE * _ALPHA_SIZE)) % _ALPHA_SIZE,
    ];
    const ranks: string[] = [];
    let last = LEXO_MIN;
    for (let i = 0; i < count; i++) {
        let offset = 0;
        let rank = '';
        for (let j = 0; j < 3; j++) {
            let code = last.charCodeAt(2 - j) - _ALPHA_BASE + perSymbol[j] + offset;
            offset = 0;
            if (code >= _ALPHA_SIZE) { offset++; code -= _ALPHA_SIZE; }
            rank += String.fromCharCode(_ALPHA_BASE + code);
        }
        rank = rank.split('').reverse().join('');
        ranks.push(rank);
        last = rank;
    }
    return ranks;
}

/** 20 evenly-spaced seed ranks — used for initial task data ordering. */
const SEED_RANKS = _generateDefaultRanks(20);

// ─── Templates ────────────────────────────────────────────────────────────────

export const TEMPLATE_ENTITY_NAME = 'mem_template';
export const TEMPLATE_METADATA: IMemoryProviderEntityMetadata = {
    PrimaryIdAttribute: 'mem_templateid',
    PrimaryNameAttribute: 'subject',
    LogicalName: TEMPLATE_ENTITY_NAME,
    QuickFindColumns: ['subject']
};

export const SAMPLE_TEMPLATES: IRawRecord[] = [
    {
        mem_templateid: 'tpl00001-0000-0000-0000-000000000000',
        subject: 'Bug Fix Template',
        description: 'Standard template for bug fix tasks',
    },
    {
        mem_templateid: 'tpl00002-0000-0000-0000-000000000000',
        subject: 'Feature Development Template',
        description: 'Template for new feature implementation',
    },
    {
        mem_templateid: 'tpl00003-0000-0000-0000-000000000000',
        subject: 'Research Spike Template',
        description: 'Time-boxed research and investigation tasks',
    },
];

/** Node in a recursive template task hierarchy. */
interface ITemplateNode {
    subject: string;
    description?: string | null;
    children: ITemplateNode[];
}

/** Child task hierarchy created per template when expanding from template. */
const _TEMPLATE_CHILDREN: Record<string, ITemplateNode[]> = {
    'tpl00001-0000-0000-0000-000000000000': [
        { subject: 'Reproduce the issue', children: [] },
        { subject: 'Identify root cause', children: [] },
        { subject: 'Implement fix', children: [] },
        { subject: 'Write regression test', children: [] },
        { subject: 'Code review & merge', children: [] },
    ],
    'tpl00002-0000-0000-0000-000000000000': [
        { subject: 'Requirements & design', children: [] },
        { subject: 'Implementation', children: [] },
        { subject: 'Unit tests', children: [] },
        { subject: 'Integration tests', children: [] },
        { subject: 'Documentation', children: [] },
        { subject: 'Code review & merge', children: [] },
    ],
    'tpl00003-0000-0000-0000-000000000000': [
        { subject: 'Define research questions', children: [] },
        { subject: 'Literature / prior art review', children: [] },
        { subject: 'Prototype or experiment', children: [] },
        { subject: 'Document findings', children: [] },
        { subject: 'Present conclusions', children: [] },
    ],
};

// ─── Task data helpers ────────────────────────────────────────────────────────

/** Generates a deterministic UUID from a compact numeric key. */
function tid(epic: number, l1 = 0, l2 = 0): string {
    return [
        epic.toString().padStart(2, '0') +
        l1.toString().padStart(3, '0') +
        l2.toString().padStart(3, '0'),
        '0000',
        '0000',
        '0000',
        '000000000000',
    ].join('-');
}

// ─── Raw task records (108 tasks) ─────────────────────────────────────────────

const TASKS: IRawRecord[] = [
    // ═════════════════════════════════════════════════════════════════════════
    // EPIC 1 — Website Redesign
    // ═════════════════════════════════════════════════════════════════════════
    {
        [PRIMARY_ID]: tid(1), subject: 'Website Redesign', [PARENT_ID_VALUE_KEY]: null,
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 0,
        statuscode: 2, priority: 2, percentcomplete: 60,
        scheduledstart: '2025-10-01', scheduledend: '2026-01-31',
        estimatedeffort: 480, actualeffort: 290,
        assignedto: 'Alex Chen', tags: 'design,frontend,backend',
        description: 'Complete overhaul of the public-facing website including UX redesign, content migration and performance improvements.',
    },
    // L1 tasks
    {
        [PRIMARY_ID]: tid(1,1), subject: 'Discovery & Planning', [PARENT_ID_VALUE_KEY]: tid(1),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 2, percentcomplete: 100,
        scheduledstart: '2025-10-01', scheduledend: '2025-10-31',
        estimatedeffort: 40, actualeffort: 42,
        assignedto: 'Sam Rivera', tags: 'requirements,planning',
        description: 'Gather requirements, conduct stakeholder interviews and perform competitive analysis.',
    },
    {
        [PRIMARY_ID]: tid(1,2), subject: 'UX/UI Design', [PARENT_ID_VALUE_KEY]: tid(1),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 2, percentcomplete: 100,
        scheduledstart: '2025-11-01', scheduledend: '2025-11-28',
        estimatedeffort: 80, actualeffort: 76,
        assignedto: 'Sam Rivera', tags: 'design,ux',
        description: 'User journey mapping, wireframing, and high-fidelity mockup creation.',
    },
    {
        [PRIMARY_ID]: tid(1,3), subject: 'Frontend Development', [PARENT_ID_VALUE_KEY]: tid(1),
        [STACK_RANK_COL]: SEED_RANKS[2], [STATE_CODE_COL]: 0,
        statuscode: 2, priority: 2, percentcomplete: 55,
        scheduledstart: '2025-12-01', scheduledend: '2026-01-15',
        estimatedeffort: 200, actualeffort: 110,
        assignedto: 'Alex Chen', tags: 'frontend,react',
        description: 'Build the new component library and implement all page templates.',
    },
    {
        [PRIMARY_ID]: tid(1,4), subject: 'Content Migration', [PARENT_ID_VALUE_KEY]: tid(1),
        [STACK_RANK_COL]: SEED_RANKS[3], [STATE_CODE_COL]: 1,
        statuscode: 3, priority: 1, percentcomplete: 30,
        scheduledstart: '2026-01-01', scheduledend: '2026-01-20',
        estimatedeffort: 60, actualeffort: 18,
        assignedto: 'Jamie Walsh', tags: 'content,seo',
        description: 'Migrate all existing content to the new CMS, set up URL redirects.',
    },
    {
        [PRIMARY_ID]: tid(1,5), subject: 'Launch & QA', [PARENT_ID_VALUE_KEY]: tid(1),
        [STACK_RANK_COL]: SEED_RANKS[4], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 2, percentcomplete: 0,
        scheduledstart: '2026-01-16', scheduledend: '2026-01-31',
        estimatedeffort: 60, actualeffort: 0,
        assignedto: 'Chris Kim', tags: 'testing,qa,performance',
        description: 'Cross-browser testing, accessibility audit and final performance optimisation.',
    },
    // L2 subtasks under Discovery & Planning
    {
        [PRIMARY_ID]: tid(1,1,1), subject: 'Stakeholder interviews', [PARENT_ID_VALUE_KEY]: tid(1,1),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 2, percentcomplete: 100,
        scheduledstart: '2025-10-01', scheduledend: '2025-10-10',
        estimatedeffort: 16, actualeffort: 18,
        assignedto: 'Sam Rivera', tags: 'requirements',
        description: 'Interview key stakeholders to capture business goals and pain points.',
    },
    {
        [PRIMARY_ID]: tid(1,1,2), subject: 'Market & competitor research', [PARENT_ID_VALUE_KEY]: tid(1,1),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 1, percentcomplete: 100,
        scheduledstart: '2025-10-11', scheduledend: '2025-10-31',
        estimatedeffort: 24, actualeffort: 24,
        assignedto: 'Alex Chen', tags: 'research',
        description: 'Analyse top competitors, identify design trends and benchmark site performance.',
    },
    // L2 subtasks under UX/UI Design
    {
        [PRIMARY_ID]: tid(1,2,1), subject: 'User journey mapping', [PARENT_ID_VALUE_KEY]: tid(1,2),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 2, percentcomplete: 100,
        scheduledstart: '2025-11-01', scheduledend: '2025-11-07',
        estimatedeffort: 16, actualeffort: 14,
        assignedto: 'Sam Rivera', tags: 'ux,design',
        description: 'Map out all primary user flows to identify friction points.',
    },
    {
        [PRIMARY_ID]: tid(1,2,2), subject: 'Wireframing', [PARENT_ID_VALUE_KEY]: tid(1,2),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 2, percentcomplete: 100,
        scheduledstart: '2025-11-08', scheduledend: '2025-11-18',
        estimatedeffort: 30, actualeffort: 28,
        assignedto: 'Sam Rivera', tags: 'ux,wireframe',
        description: 'Create low-fidelity wireframes for all key pages.',
    },
    {
        [PRIMARY_ID]: tid(1,2,3), subject: 'High-fidelity mockups', [PARENT_ID_VALUE_KEY]: tid(1,2),
        [STACK_RANK_COL]: SEED_RANKS[2], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 2, percentcomplete: 100,
        scheduledstart: '2025-11-19', scheduledend: '2025-11-28',
        estimatedeffort: 34, actualeffort: 34,
        assignedto: 'Sam Rivera', tags: 'design,ui',
        description: 'Produce pixel-perfect mockups and an interactive prototype.',
    },
    // L2 subtasks under Frontend Development
    {
        [PRIMARY_ID]: tid(1,3,1), subject: 'Design system setup', [PARENT_ID_VALUE_KEY]: tid(1,3),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 2, percentcomplete: 100,
        scheduledstart: '2025-12-01', scheduledend: '2025-12-10',
        estimatedeffort: 32, actualeffort: 30,
        assignedto: 'Alex Chen', tags: 'frontend,design-system',
        description: 'Establish a shared component library with tokens, typography, and colours.',
    },
    {
        [PRIMARY_ID]: tid(1,3,2), subject: 'Homepage & hero section', [PARENT_ID_VALUE_KEY]: tid(1,3),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 2, percentcomplete: 100,
        scheduledstart: '2025-12-11', scheduledend: '2025-12-20',
        estimatedeffort: 40, actualeffort: 38,
        assignedto: 'Alex Chen', tags: 'frontend',
        description: 'Implement the homepage with animated hero, feature highlights, and CTA sections.',
    },
    {
        [PRIMARY_ID]: tid(1,3,3), subject: 'Product catalog pages', [PARENT_ID_VALUE_KEY]: tid(1,3),
        [STACK_RANK_COL]: SEED_RANKS[2], [STATE_CODE_COL]: 0,
        statuscode: 2, priority: 2, percentcomplete: 60,
        scheduledstart: '2025-12-21', scheduledend: '2026-01-07',
        estimatedeffort: 60, actualeffort: 36,
        assignedto: 'Alex Chen', tags: 'frontend',
        description: 'Build filterable product listing with lazy-load, quick-view, and sorting.',
    },
    {
        [PRIMARY_ID]: tid(1,3,4), subject: 'Checkout flow', [PARENT_ID_VALUE_KEY]: tid(1,3),
        [STACK_RANK_COL]: SEED_RANKS[3], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 3, percentcomplete: 0,
        scheduledstart: '2026-01-08', scheduledend: '2026-01-15',
        estimatedeffort: 50, actualeffort: 0,
        assignedto: 'Alex Chen', tags: 'frontend,payments',
        description: 'Multi-step checkout with address, payment, and order-confirmation screens.',
    },
    // L2 subtasks under Content Migration
    {
        [PRIMARY_ID]: tid(1,4,1), subject: 'Content inventory', [PARENT_ID_VALUE_KEY]: tid(1,4),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 1, percentcomplete: 100,
        scheduledstart: '2026-01-01', scheduledend: '2026-01-08',
        estimatedeffort: 16, actualeffort: 15,
        assignedto: 'Jamie Walsh', tags: 'content',
        description: 'Audit all existing pages and assets; classify for keep / update / retire.',
    },
    {
        [PRIMARY_ID]: tid(1,4,2), subject: 'SEO redirect mapping', [PARENT_ID_VALUE_KEY]: tid(1,4),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 1,
        statuscode: 3, priority: 1, percentcomplete: 20,
        scheduledstart: '2026-01-09', scheduledend: '2026-01-20',
        estimatedeffort: 24, actualeffort: 5,
        assignedto: 'Jamie Walsh', tags: 'seo,content',
        description: 'Map all old URLs to new slugs and configure 301 redirects.',
    },
    // L2 subtasks under Launch & QA
    {
        [PRIMARY_ID]: tid(1,5,1), subject: 'Cross-browser testing', [PARENT_ID_VALUE_KEY]: tid(1,5),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 2, percentcomplete: 0,
        scheduledstart: '2026-01-16', scheduledend: '2026-01-22',
        estimatedeffort: 20, actualeffort: 0,
        assignedto: 'Chris Kim', tags: 'testing,qa',
        description: 'Verify layout and functionality on Chrome, Firefox, Safari, Edge, and iOS/Android.',
    },
    {
        [PRIMARY_ID]: tid(1,5,2), subject: 'Performance optimisation', [PARENT_ID_VALUE_KEY]: tid(1,5),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 2, percentcomplete: 0,
        scheduledstart: '2026-01-23', scheduledend: '2026-01-27',
        estimatedeffort: 16, actualeffort: 0,
        assignedto: 'Alex Chen', tags: 'performance,frontend',
        description: 'Achieve Core Web Vitals score ≥ 90 on mobile and desktop.',
    },
    {
        [PRIMARY_ID]: tid(1,5,3), subject: 'Accessibility audit', [PARENT_ID_VALUE_KEY]: tid(1,5),
        [STACK_RANK_COL]: SEED_RANKS[2], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 2, percentcomplete: 0,
        scheduledstart: '2026-01-28', scheduledend: '2026-01-31',
        estimatedeffort: 12, actualeffort: 0,
        assignedto: 'Chris Kim', tags: 'a11y,testing',
        description: 'Ensure WCAG 2.1 AA compliance; fix all critical and major issues.',
    },

    // ═════════════════════════════════════════════════════════════════════════
    // EPIC 2 — API Platform v2
    // ═════════════════════════════════════════════════════════════════════════
    {
        [PRIMARY_ID]: tid(2), subject: 'API Platform v2', [PARENT_ID_VALUE_KEY]: null,
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 0,
        statuscode: 2, priority: 3, percentcomplete: 45,
        scheduledstart: '2025-09-01', scheduledend: '2026-03-31',
        estimatedeffort: 600, actualeffort: 270,
        assignedto: 'Maya Patel', tags: 'api,backend,architecture',
        description: 'Ground-up rewrite of the REST API with versioning, improved auth, and a public developer portal.',
    },
    {
        [PRIMARY_ID]: tid(2,1), subject: 'Architecture Planning', [PARENT_ID_VALUE_KEY]: tid(2),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 3, percentcomplete: 100,
        scheduledstart: '2025-09-01', scheduledend: '2025-09-30',
        estimatedeffort: 40, actualeffort: 48,
        assignedto: 'Maya Patel', tags: 'architecture,api',
        description: 'Define API versioning strategy, contract-first design and technology stack.',
    },
    {
        [PRIMARY_ID]: tid(2,1,1), subject: 'API design review board', [PARENT_ID_VALUE_KEY]: tid(2,1),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 3, percentcomplete: 100,
        scheduledstart: '2025-09-15', scheduledend: '2025-09-30',
        estimatedeffort: 16, actualeffort: 20,
        assignedto: 'Maya Patel', tags: 'architecture',
        description: 'Establish a cross-team review board and sign off on the final spec.',
    },
    {
        [PRIMARY_ID]: tid(2,2), subject: 'Authentication & Authorisation', [PARENT_ID_VALUE_KEY]: tid(2),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 3, percentcomplete: 100,
        scheduledstart: '2025-10-01', scheduledend: '2025-11-15',
        estimatedeffort: 80, actualeffort: 90,
        assignedto: 'Taylor Morgan', tags: 'security,auth,oauth',
        description: 'Implement OAuth 2.0 with PKCE, JWT short-lived tokens, and API key management.',
    },
    {
        [PRIMARY_ID]: tid(2,2,1), subject: 'OAuth 2.0 implementation', [PARENT_ID_VALUE_KEY]: tid(2,2),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 3, percentcomplete: 100,
        scheduledstart: '2025-10-01', scheduledend: '2025-10-31',
        estimatedeffort: 48, actualeffort: 55,
        assignedto: 'Taylor Morgan', tags: 'auth,oauth,security',
        description: 'Integrate an OAuth 2.0 provider with PKCE flow and token refresh logic.',
    },
    {
        [PRIMARY_ID]: tid(2,2,2), subject: 'API key management', [PARENT_ID_VALUE_KEY]: tid(2,2),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 2, percentcomplete: 100,
        scheduledstart: '2025-11-01', scheduledend: '2025-11-15',
        estimatedeffort: 24, actualeffort: 24,
        assignedto: 'Taylor Morgan', tags: 'auth,api',
        description: 'Self-service portal for generating, rotating and revoking API keys.',
    },
    {
        [PRIMARY_ID]: tid(2,3), subject: 'Core API Endpoints', [PARENT_ID_VALUE_KEY]: tid(2),
        [STACK_RANK_COL]: SEED_RANKS[2], [STATE_CODE_COL]: 0,
        statuscode: 2, priority: 3, percentcomplete: 60,
        scheduledstart: '2025-11-16', scheduledend: '2026-01-31',
        estimatedeffort: 200, actualeffort: 120,
        assignedto: 'Maya Patel', tags: 'backend,api',
        description: 'Build and document all v2 CRUD endpoints for core resources.',
    },
    {
        [PRIMARY_ID]: tid(2,3,1), subject: 'Users & accounts endpoints', [PARENT_ID_VALUE_KEY]: tid(2,3),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 3, percentcomplete: 100,
        scheduledstart: '2025-11-16', scheduledend: '2025-12-15',
        estimatedeffort: 60, actualeffort: 62,
        assignedto: 'Maya Patel', tags: 'backend,api',
        description: 'Full CRUD for user profiles, organisation membership, and preferences.',
    },
    {
        [PRIMARY_ID]: tid(2,3,2), subject: 'Products & catalog endpoints', [PARENT_ID_VALUE_KEY]: tid(2,3),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 0,
        statuscode: 2, priority: 2, percentcomplete: 70,
        scheduledstart: '2025-12-16', scheduledend: '2026-01-15',
        estimatedeffort: 70, actualeffort: 49,
        assignedto: 'Maya Patel', tags: 'backend,catalog',
        description: 'Endpoints for product listings, variants, pricing, and inventory.',
    },
    {
        [PRIMARY_ID]: tid(2,3,3), subject: 'Orders & billing endpoints', [PARENT_ID_VALUE_KEY]: tid(2,3),
        [STACK_RANK_COL]: SEED_RANKS[2], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 3, percentcomplete: 0,
        scheduledstart: '2026-01-16', scheduledend: '2026-01-31',
        estimatedeffort: 70, actualeffort: 0,
        assignedto: 'Maya Patel', tags: 'backend,billing',
        description: 'Order lifecycle management including placement, fulfilment, and refunds.',
    },
    {
        [PRIMARY_ID]: tid(2,4), subject: 'Rate Limiting & Caching', [PARENT_ID_VALUE_KEY]: tid(2),
        [STACK_RANK_COL]: SEED_RANKS[3], [STATE_CODE_COL]: 1,
        statuscode: 3, priority: 2, percentcomplete: 15,
        scheduledstart: '2026-02-01', scheduledend: '2026-02-28',
        estimatedeffort: 40, actualeffort: 6,
        assignedto: 'Jordan Lee', tags: 'backend,performance',
        description: 'Implement per-tier rate limiting with Redis-backed sliding-window counters and response caching.',
    },
    {
        [PRIMARY_ID]: tid(2,5), subject: 'Developer Documentation', [PARENT_ID_VALUE_KEY]: tid(2),
        [STACK_RANK_COL]: SEED_RANKS[4], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 2, percentcomplete: 0,
        scheduledstart: '2026-03-01', scheduledend: '2026-03-31',
        estimatedeffort: 60, actualeffort: 0,
        assignedto: 'Jamie Walsh', tags: 'docs,api',
        description: 'Interactive developer portal with guides, changelogs, and a request playground.',
    },
    {
        [PRIMARY_ID]: tid(2,5,1), subject: 'OpenAPI spec', [PARENT_ID_VALUE_KEY]: tid(2,5),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 2, percentcomplete: 0,
        scheduledstart: '2026-03-01', scheduledend: '2026-03-15',
        estimatedeffort: 24, actualeffort: 0,
        assignedto: 'Maya Patel', tags: 'api,docs',
        description: 'Maintain a single source-of-truth OpenAPI 3.1 specification for all endpoints.',
    },
    {
        [PRIMARY_ID]: tid(2,5,2), subject: 'SDK code samples', [PARENT_ID_VALUE_KEY]: tid(2,5),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 1, percentcomplete: 0,
        scheduledstart: '2026-03-16', scheduledend: '2026-03-31',
        estimatedeffort: 24, actualeffort: 0,
        assignedto: 'Jamie Walsh', tags: 'docs,sdk',
        description: 'Provide idiomatic code samples in Python, TypeScript, and Go.',
    },

    // ═════════════════════════════════════════════════════════════════════════
    // EPIC 3 — Mobile App (iOS + Android)
    // ═════════════════════════════════════════════════════════════════════════
    {
        [PRIMARY_ID]: tid(3), subject: 'Mobile App (iOS + Android)', [PARENT_ID_VALUE_KEY]: null,
        [STACK_RANK_COL]: SEED_RANKS[2], [STATE_CODE_COL]: 0,
        statuscode: 2, priority: 3, percentcomplete: 40,
        scheduledstart: '2025-11-01', scheduledend: '2026-04-30',
        estimatedeffort: 700, actualeffort: 280,
        assignedto: 'Alex Chen', tags: 'mobile,react-native',
        description: 'Cross-platform mobile app using React Native targeting iOS 16+ and Android 12+.',
    },
    {
        [PRIMARY_ID]: tid(3,1), subject: 'Project Setup', [PARENT_ID_VALUE_KEY]: tid(3),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 2, percentcomplete: 100,
        scheduledstart: '2025-11-01', scheduledend: '2025-11-15',
        estimatedeffort: 40, actualeffort: 38,
        assignedto: 'Jordan Lee', tags: 'mobile,ci-cd',
        description: 'Repository, monorepo tooling, CI/CD, code signing, and store accounts.',
    },
    {
        [PRIMARY_ID]: tid(3,1,1), subject: 'Architecture & tech stack decisions', [PARENT_ID_VALUE_KEY]: tid(3,1),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 2, percentcomplete: 100,
        scheduledstart: '2025-11-01', scheduledend: '2025-11-05',
        estimatedeffort: 16, actualeffort: 14,
        assignedto: 'Alex Chen', tags: 'architecture,mobile',
        description: 'Decide navigation library, state management, and offline-first strategy.',
    },
    {
        [PRIMARY_ID]: tid(3,1,2), subject: 'CI/CD pipeline for mobile', [PARENT_ID_VALUE_KEY]: tid(3,1),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 2, percentcomplete: 100,
        scheduledstart: '2025-11-06', scheduledend: '2025-11-15',
        estimatedeffort: 24, actualeffort: 24,
        assignedto: 'Jordan Lee', tags: 'ci-cd,mobile',
        description: 'Automated test runs, code signing, and OTA deployment via Expo EAS.',
    },
    {
        [PRIMARY_ID]: tid(3,2), subject: 'Core Screens', [PARENT_ID_VALUE_KEY]: tid(3),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 0,
        statuscode: 2, priority: 3, percentcomplete: 50,
        scheduledstart: '2025-11-16', scheduledend: '2026-02-28',
        estimatedeffort: 300, actualeffort: 150,
        assignedto: 'Alex Chen', tags: 'mobile,frontend',
        description: 'Build all primary screens following the approved design system.',
    },
    {
        [PRIMARY_ID]: tid(3,2,1), subject: 'Onboarding flow', [PARENT_ID_VALUE_KEY]: tid(3,2),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 3, percentcomplete: 100,
        scheduledstart: '2025-11-16', scheduledend: '2025-12-05',
        estimatedeffort: 60, actualeffort: 65,
        assignedto: 'Alex Chen', tags: 'mobile,ux',
        description: 'Welcome screens, permissions, account creation, and biometric set-up.',
    },
    {
        [PRIMARY_ID]: tid(3,2,2), subject: 'Home dashboard', [PARENT_ID_VALUE_KEY]: tid(3,2),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 3, percentcomplete: 100,
        scheduledstart: '2025-12-06', scheduledend: '2025-12-31',
        estimatedeffort: 60, actualeffort: 60,
        assignedto: 'Alex Chen', tags: 'mobile,dashboard',
        description: 'Personalised dashboard with activity feed, quick actions, and KPI tiles.',
    },
    {
        [PRIMARY_ID]: tid(3,2,3), subject: 'Product listing screen', [PARENT_ID_VALUE_KEY]: tid(3,2),
        [STACK_RANK_COL]: SEED_RANKS[2], [STATE_CODE_COL]: 0,
        statuscode: 2, priority: 2, percentcomplete: 40,
        scheduledstart: '2026-01-01', scheduledend: '2026-01-31',
        estimatedeffort: 80, actualeffort: 32,
        assignedto: 'Alex Chen', tags: 'mobile,catalog',
        description: 'Infinite scroll product grid with search filters and swipe gestures.',
    },
    {
        [PRIMARY_ID]: tid(3,2,4), subject: 'User profile screen', [PARENT_ID_VALUE_KEY]: tid(3,2),
        [STACK_RANK_COL]: SEED_RANKS[3], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 1, percentcomplete: 0,
        scheduledstart: '2026-02-01', scheduledend: '2026-02-28',
        estimatedeffort: 40, actualeffort: 0,
        assignedto: 'Alex Chen', tags: 'mobile,profile',
        description: 'Settings, notification preferences, order history, and account deletion.',
    },
    {
        [PRIMARY_ID]: tid(3,3), subject: 'API Integration', [PARENT_ID_VALUE_KEY]: tid(3),
        [STACK_RANK_COL]: SEED_RANKS[2], [STATE_CODE_COL]: 0,
        statuscode: 2, priority: 3, percentcomplete: 40,
        scheduledstart: '2025-12-01', scheduledend: '2026-03-31',
        estimatedeffort: 160, actualeffort: 64,
        assignedto: 'Maya Patel', tags: 'mobile,api,backend',
        description: 'Integrate mobile client with Platform v2 APIs including auth, catalog, and orders.',
    },
    {
        [PRIMARY_ID]: tid(3,3,1), subject: 'Authentication flows', [PARENT_ID_VALUE_KEY]: tid(3,3),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 3, percentcomplete: 100,
        scheduledstart: '2025-12-01', scheduledend: '2025-12-31',
        estimatedeffort: 40, actualeffort: 38,
        assignedto: 'Taylor Morgan', tags: 'auth,mobile',
        description: 'OAuth PKCE flow, biometric token storage, and session refresh logic.',
    },
    {
        [PRIMARY_ID]: tid(3,3,2), subject: 'Data synchronisation', [PARENT_ID_VALUE_KEY]: tid(3,3),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 0,
        statuscode: 2, priority: 2, percentcomplete: 25,
        scheduledstart: '2026-01-01', scheduledend: '2026-03-31',
        estimatedeffort: 80, actualeffort: 20,
        assignedto: 'Maya Patel', tags: 'mobile,sync',
        description: 'Background sync of catalog and order data with conflict resolution.',
    },
    {
        [PRIMARY_ID]: tid(3,4), subject: 'Offline Support', [PARENT_ID_VALUE_KEY]: tid(3),
        [STACK_RANK_COL]: SEED_RANKS[3], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 2, percentcomplete: 0,
        scheduledstart: '2026-03-01', scheduledend: '2026-04-15',
        estimatedeffort: 80, actualeffort: 0,
        assignedto: 'Maya Patel', tags: 'mobile,offline',
        description: 'Allow browsing and adding to cart while offline; queue mutations for replay.',
    },
    {
        [PRIMARY_ID]: tid(3,4,1), subject: 'Local SQLite database setup', [PARENT_ID_VALUE_KEY]: tid(3,4),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 2, percentcomplete: 0,
        scheduledstart: '2026-03-01', scheduledend: '2026-03-20',
        estimatedeffort: 40, actualeffort: 0,
        assignedto: 'Maya Patel', tags: 'mobile,database',
        description: 'Schema design and migration tooling for the on-device SQLite store.',
    },
    {
        [PRIMARY_ID]: tid(3,5), subject: 'App Store Submission', [PARENT_ID_VALUE_KEY]: tid(3),
        [STACK_RANK_COL]: SEED_RANKS[4], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 3, percentcomplete: 0,
        scheduledstart: '2026-04-16', scheduledend: '2026-04-30',
        estimatedeffort: 24, actualeffort: 0,
        assignedto: 'Jordan Lee', tags: 'mobile,release',
        description: 'Prepare store listings, screenshots, privacy disclosures, and binary submission.',
    },
    {
        [PRIMARY_ID]: tid(3,5,1), subject: 'Apple App Store submission', [PARENT_ID_VALUE_KEY]: tid(3,5),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 3, percentcomplete: 0,
        scheduledstart: '2026-04-16', scheduledend: '2026-04-23',
        estimatedeffort: 12, actualeffort: 0,
        assignedto: 'Jordan Lee', tags: 'ios,release',
        description: 'App Store Connect setup, TestFlight beta, and production release.',
    },
    {
        [PRIMARY_ID]: tid(3,5,2), subject: 'Google Play Store submission', [PARENT_ID_VALUE_KEY]: tid(3,5),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 3, percentcomplete: 0,
        scheduledstart: '2026-04-24', scheduledend: '2026-04-30',
        estimatedeffort: 8, actualeffort: 0,
        assignedto: 'Jordan Lee', tags: 'android,release',
        description: 'Google Play Console setup, internal testing, and production track promotion.',
    },

    // ═════════════════════════════════════════════════════════════════════════
    // EPIC 4 — Infrastructure & DevOps
    // ═════════════════════════════════════════════════════════════════════════
    {
        [PRIMARY_ID]: tid(4), subject: 'Infrastructure & DevOps', [PARENT_ID_VALUE_KEY]: null,
        [STACK_RANK_COL]: SEED_RANKS[3], [STATE_CODE_COL]: 0,
        statuscode: 2, priority: 2, percentcomplete: 55,
        scheduledstart: '2025-08-01', scheduledend: '2026-02-28',
        estimatedeffort: 400, actualeffort: 220,
        assignedto: 'Jordan Lee', tags: 'devops,infrastructure',
        description: 'Modernise the delivery pipeline and cloud infrastructure for the next growth phase.',
    },
    {
        [PRIMARY_ID]: tid(4,1), subject: 'CI/CD Pipeline', [PARENT_ID_VALUE_KEY]: tid(4),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 3, percentcomplete: 100,
        scheduledstart: '2025-08-01', scheduledend: '2025-09-30',
        estimatedeffort: 120, actualeffort: 130,
        assignedto: 'Jordan Lee', tags: 'ci-cd,devops',
        description: 'End-to-end automated pipeline from commit to production deployment.',
    },
    {
        [PRIMARY_ID]: tid(4,1,1), subject: 'GitHub Actions workflow setup', [PARENT_ID_VALUE_KEY]: tid(4,1),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 3, percentcomplete: 100,
        scheduledstart: '2025-08-01', scheduledend: '2025-08-20',
        estimatedeffort: 40, actualeffort: 42,
        assignedto: 'Jordan Lee', tags: 'ci-cd,github-actions',
        description: 'Define reusable workflow templates for lint, test, build, and deploy stages.',
    },
    {
        [PRIMARY_ID]: tid(4,1,2), subject: 'Automated testing pipeline', [PARENT_ID_VALUE_KEY]: tid(4,1),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 2, percentcomplete: 100,
        scheduledstart: '2025-08-21', scheduledend: '2025-09-10',
        estimatedeffort: 40, actualeffort: 45,
        assignedto: 'Chris Kim', tags: 'ci-cd,testing',
        description: 'Unit, integration, and smoke test stages with coverage gates.',
    },
    {
        [PRIMARY_ID]: tid(4,1,3), subject: 'Docker containerisation', [PARENT_ID_VALUE_KEY]: tid(4,1),
        [STACK_RANK_COL]: SEED_RANKS[2], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 2, percentcomplete: 100,
        scheduledstart: '2025-09-11', scheduledend: '2025-09-30',
        estimatedeffort: 24, actualeffort: 25,
        assignedto: 'Jordan Lee', tags: 'docker,ci-cd',
        description: 'Multi-stage Dockerfiles, image tagging strategy, and registry configuration.',
    },
    {
        [PRIMARY_ID]: tid(4,2), subject: 'Cloud Infrastructure', [PARENT_ID_VALUE_KEY]: tid(4),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 0,
        statuscode: 2, priority: 3, percentcomplete: 60,
        scheduledstart: '2025-10-01', scheduledend: '2025-12-31',
        estimatedeffort: 120, actualeffort: 72,
        assignedto: 'Jordan Lee', tags: 'kubernetes,cloud',
        description: 'Migrate workloads to managed Kubernetes with autoscaling and blue/green deployments.',
    },
    {
        [PRIMARY_ID]: tid(4,2,1), subject: 'Kubernetes cluster setup', [PARENT_ID_VALUE_KEY]: tid(4,2),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 3, percentcomplete: 100,
        scheduledstart: '2025-10-01', scheduledend: '2025-11-15',
        estimatedeffort: 80, actualeffort: 85,
        assignedto: 'Jordan Lee', tags: 'kubernetes,cloud',
        description: 'EKS clusters (staging + prod), node groups, namespaces, and RBAC.',
    },
    {
        [PRIMARY_ID]: tid(4,2,2), subject: 'Load balancer configuration', [PARENT_ID_VALUE_KEY]: tid(4,2),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 0,
        statuscode: 2, priority: 2, percentcomplete: 30,
        scheduledstart: '2025-11-16', scheduledend: '2025-12-31',
        estimatedeffort: 32, actualeffort: 10,
        assignedto: 'Jordan Lee', tags: 'cloud,networking',
        description: 'ALB Ingress controller with SSL termination, WAF rules, and health checks.',
    },
    {
        [PRIMARY_ID]: tid(4,3), subject: 'Monitoring & Alerting', [PARENT_ID_VALUE_KEY]: tid(4),
        [STACK_RANK_COL]: SEED_RANKS[2], [STATE_CODE_COL]: 0,
        statuscode: 2, priority: 2, percentcomplete: 50,
        scheduledstart: '2026-01-01', scheduledend: '2026-01-31',
        estimatedeffort: 80, actualeffort: 40,
        assignedto: 'Jordan Lee', tags: 'monitoring,devops',
        description: 'Full observability stack: metrics, logs, traces, and on-call alerting.',
    },
    {
        [PRIMARY_ID]: tid(4,3,1), subject: 'Prometheus + Grafana dashboards', [PARENT_ID_VALUE_KEY]: tid(4,3),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 0,
        statuscode: 2, priority: 2, percentcomplete: 70,
        scheduledstart: '2026-01-01', scheduledend: '2026-01-20',
        estimatedeffort: 48, actualeffort: 34,
        assignedto: 'Jordan Lee', tags: 'monitoring,grafana',
        description: 'Dashboards for API latency, error rate, pod resource usage, and business metrics.',
    },
    {
        [PRIMARY_ID]: tid(4,3,2), subject: 'PagerDuty integration', [PARENT_ID_VALUE_KEY]: tid(4,3),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 2, percentcomplete: 0,
        scheduledstart: '2026-01-21', scheduledend: '2026-01-31',
        estimatedeffort: 16, actualeffort: 0,
        assignedto: 'Jordan Lee', tags: 'alerting,on-call',
        description: 'Tie Grafana alerting rules to PagerDuty with escalation policies.',
    },
    {
        [PRIMARY_ID]: tid(4,4), subject: 'Disaster Recovery', [PARENT_ID_VALUE_KEY]: tid(4),
        [STACK_RANK_COL]: SEED_RANKS[3], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 2, percentcomplete: 0,
        scheduledstart: '2026-02-01', scheduledend: '2026-02-28',
        estimatedeffort: 60, actualeffort: 0,
        assignedto: 'Jordan Lee', tags: 'dr,backup',
        description: 'Documented recovery playbooks, automated backups, and quarterly failover drills.',
    },
    {
        [PRIMARY_ID]: tid(4,4,1), subject: 'Backup strategy & automation', [PARENT_ID_VALUE_KEY]: tid(4,4),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 2, percentcomplete: 0,
        scheduledstart: '2026-02-01', scheduledend: '2026-02-15',
        estimatedeffort: 32, actualeffort: 0,
        assignedto: 'Jordan Lee', tags: 'backup,dr',
        description: 'Automated nightly snapshots for databases and object storage with 30-day retention.',
    },
    {
        [PRIMARY_ID]: tid(4,4,2), subject: 'Failover testing drill', [PARENT_ID_VALUE_KEY]: tid(4,4),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 1, percentcomplete: 0,
        scheduledstart: '2026-02-16', scheduledend: '2026-02-28',
        estimatedeffort: 16, actualeffort: 0,
        assignedto: 'Jordan Lee', tags: 'dr,testing',
        description: 'Simulate RDS failover and restore; measure and document RTO/RPO.',
    },

    // ═════════════════════════════════════════════════════════════════════════
    // EPIC 5 — Security & Compliance
    // ═════════════════════════════════════════════════════════════════════════
    {
        [PRIMARY_ID]: tid(5), subject: 'Security & Compliance', [PARENT_ID_VALUE_KEY]: null,
        [STACK_RANK_COL]: SEED_RANKS[4], [STATE_CODE_COL]: 0,
        statuscode: 2, priority: 3, percentcomplete: 35,
        scheduledstart: '2025-09-01', scheduledend: '2026-06-30',
        estimatedeffort: 360, actualeffort: 126,
        assignedto: 'Taylor Morgan', tags: 'security,compliance',
        description: 'Harden the product and organisation against internal and external threats; achieve SOC 2 Type II.',
    },
    {
        [PRIMARY_ID]: tid(5,1), subject: 'Security Audit', [PARENT_ID_VALUE_KEY]: tid(5),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 3, percentcomplete: 100,
        scheduledstart: '2025-09-01', scheduledend: '2025-10-31',
        estimatedeffort: 80, actualeffort: 96,
        assignedto: 'Taylor Morgan', tags: 'security,audit',
        description: 'Third-party security audit covering infrastructure, application, and supply chain.',
    },
    {
        [PRIMARY_ID]: tid(5,1,1), subject: 'OWASP vulnerability scan', [PARENT_ID_VALUE_KEY]: tid(5,1),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 3, percentcomplete: 100,
        scheduledstart: '2025-09-01', scheduledend: '2025-09-20',
        estimatedeffort: 24, actualeffort: 28,
        assignedto: 'Taylor Morgan', tags: 'security,owasp',
        description: 'Automated DAST scan with OWASP ZAP; triage and log all findings.',
    },
    {
        [PRIMARY_ID]: tid(5,1,2), subject: 'Penetration testing', [PARENT_ID_VALUE_KEY]: tid(5,1),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 3, percentcomplete: 100,
        scheduledstart: '2025-09-21', scheduledend: '2025-10-31',
        estimatedeffort: 40, actualeffort: 50,
        assignedto: 'Taylor Morgan', tags: 'security,pentest',
        description: 'Manual pen test by an external firm; remediate all critical and high findings.',
    },
    {
        [PRIMARY_ID]: tid(5,2), subject: 'GDPR Compliance', [PARENT_ID_VALUE_KEY]: tid(5),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 0,
        statuscode: 2, priority: 3, percentcomplete: 50,
        scheduledstart: '2025-11-01', scheduledend: '2026-02-28',
        estimatedeffort: 100, actualeffort: 50,
        assignedto: 'Taylor Morgan', tags: 'gdpr,compliance,legal',
        description: 'Full GDPR compliance programme including data mapping, DPA, and user rights flows.',
    },
    {
        [PRIMARY_ID]: tid(5,2,1), subject: 'Data inventory & mapping', [PARENT_ID_VALUE_KEY]: tid(5,2),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 3, percentcomplete: 100,
        scheduledstart: '2025-11-01', scheduledend: '2025-11-30',
        estimatedeffort: 32, actualeffort: 35,
        assignedto: 'Taylor Morgan', tags: 'gdpr,data',
        description: 'Record of Processing Activities (RoPA) documenting all personal data flows.',
    },
    {
        [PRIMARY_ID]: tid(5,2,2), subject: 'Privacy policy update', [PARENT_ID_VALUE_KEY]: tid(5,2),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 2, percentcomplete: 100,
        scheduledstart: '2025-12-01', scheduledend: '2025-12-20',
        estimatedeffort: 16, actualeffort: 14,
        assignedto: 'Jamie Walsh', tags: 'gdpr,legal',
        description: 'Plain-language privacy policy co-authored with legal counsel.',
    },
    {
        [PRIMARY_ID]: tid(5,2,3), subject: 'Cookie consent implementation', [PARENT_ID_VALUE_KEY]: tid(5,2),
        [STACK_RANK_COL]: SEED_RANKS[2], [STATE_CODE_COL]: 0,
        statuscode: 2, priority: 2, percentcomplete: 25,
        scheduledstart: '2026-01-01', scheduledend: '2026-01-31',
        estimatedeffort: 24, actualeffort: 6,
        assignedto: 'Alex Chen', tags: 'gdpr,frontend',
        description: 'Granular consent banner, preference centre, and server-side consent signal.',
    },
    {
        [PRIMARY_ID]: tid(5,3), subject: 'SOC 2 Type II Certification', [PARENT_ID_VALUE_KEY]: tid(5),
        [STACK_RANK_COL]: SEED_RANKS[2], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 3, percentcomplete: 0,
        scheduledstart: '2026-03-01', scheduledend: '2026-06-30',
        estimatedeffort: 120, actualeffort: 0,
        assignedto: 'Taylor Morgan', tags: 'soc2,compliance',
        description: 'Engage auditor, implement controls, and collect evidence for a 12-month observation period.',
    },
    {
        [PRIMARY_ID]: tid(5,3,1), subject: 'Controls documentation', [PARENT_ID_VALUE_KEY]: tid(5,3),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 3, percentcomplete: 0,
        scheduledstart: '2026-03-01', scheduledend: '2026-04-30',
        estimatedeffort: 60, actualeffort: 0,
        assignedto: 'Taylor Morgan', tags: 'soc2,docs',
        description: 'Write control narratives, policies, and evidence collection procedures.',
    },
    {
        [PRIMARY_ID]: tid(5,4), subject: 'Access Control Review', [PARENT_ID_VALUE_KEY]: tid(5),
        [STACK_RANK_COL]: SEED_RANKS[3], [STATE_CODE_COL]: 0,
        statuscode: 2, priority: 2, percentcomplete: 40,
        scheduledstart: '2025-12-01', scheduledend: '2025-12-31',
        estimatedeffort: 40, actualeffort: 16,
        assignedto: 'Taylor Morgan', tags: 'security,access',
        description: 'Quarterly access review: least-privilege audit, MFA enforcement, and offboarding check.',
    },
    {
        [PRIMARY_ID]: tid(5,4,1), subject: 'Role-based access audit', [PARENT_ID_VALUE_KEY]: tid(5,4),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 2, percentcomplete: 100,
        scheduledstart: '2025-12-01', scheduledend: '2025-12-15',
        estimatedeffort: 24, actualeffort: 22,
        assignedto: 'Taylor Morgan', tags: 'security,rbac',
        description: 'Review all IAM roles and service accounts; remove stale permissions.',
    },
    {
        [PRIMARY_ID]: tid(5,4,2), subject: 'MFA enforcement', [PARENT_ID_VALUE_KEY]: tid(5,4),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 0,
        statuscode: 2, priority: 2, percentcomplete: 50,
        scheduledstart: '2025-12-16', scheduledend: '2025-12-31',
        estimatedeffort: 8, actualeffort: 4,
        assignedto: 'Taylor Morgan', tags: 'security,mfa',
        description: 'Enforce TOTP MFA for all internal SSO accounts; block legacy auth.',
    },

    // ═════════════════════════════════════════════════════════════════════════
    // EPIC 6 — Documentation & Training
    // ═════════════════════════════════════════════════════════════════════════
    {
        [PRIMARY_ID]: tid(6), subject: 'Documentation & Training', [PARENT_ID_VALUE_KEY]: null,
        [STACK_RANK_COL]: SEED_RANKS[5], [STATE_CODE_COL]: 0,
        statuscode: 2, priority: 1, percentcomplete: 30,
        scheduledstart: '2025-10-01', scheduledend: '2026-05-31',
        estimatedeffort: 280, actualeffort: 84,
        assignedto: 'Jamie Walsh', tags: 'docs,training',
        description: 'Comprehensive technical documentation and end-user training programme.',
    },
    {
        [PRIMARY_ID]: tid(6,1), subject: 'Technical Documentation', [PARENT_ID_VALUE_KEY]: tid(6),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 0,
        statuscode: 2, priority: 2, percentcomplete: 50,
        scheduledstart: '2025-10-01', scheduledend: '2026-01-31',
        estimatedeffort: 100, actualeffort: 50,
        assignedto: 'Jamie Walsh', tags: 'docs,technical',
        description: 'Architecture guides, API references, and contributo guides for internal and external developers.',
    },
    {
        [PRIMARY_ID]: tid(6,1,1), subject: 'Architecture guide', [PARENT_ID_VALUE_KEY]: tid(6,1),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 2, percentcomplete: 100,
        scheduledstart: '2025-10-01', scheduledend: '2025-11-15',
        estimatedeffort: 30, actualeffort: 32,
        assignedto: 'Maya Patel', tags: 'docs,architecture',
        description: 'System architecture, component interactions, data flow diagrams, and ADRs.',
    },
    {
        [PRIMARY_ID]: tid(6,1,2), subject: 'API reference docs', [PARENT_ID_VALUE_KEY]: tid(6,1),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 0,
        statuscode: 2, priority: 2, percentcomplete: 40,
        scheduledstart: '2025-11-16', scheduledend: '2026-01-15',
        estimatedeffort: 40, actualeffort: 16,
        assignedto: 'Jamie Walsh', tags: 'docs,api',
        description: 'Auto-generated and hand-written reference for every endpoint, event, and webhook.',
    },
    {
        [PRIMARY_ID]: tid(6,1,3), subject: 'Code style & contribution guide', [PARENT_ID_VALUE_KEY]: tid(6,1),
        [STACK_RANK_COL]: SEED_RANKS[2], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 1, percentcomplete: 0,
        scheduledstart: '2026-01-16', scheduledend: '2026-01-31',
        estimatedeffort: 16, actualeffort: 0,
        assignedto: 'Alex Chen', tags: 'docs,engineering',
        description: 'ESLint config rationale, branch naming, PR template, and commit conventions.',
    },
    {
        [PRIMARY_ID]: tid(6,2), subject: 'End-user Guides', [PARENT_ID_VALUE_KEY]: tid(6),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 0,
        statuscode: 2, priority: 2, percentcomplete: 35,
        scheduledstart: '2025-12-01', scheduledend: '2026-03-31',
        estimatedeffort: 80, actualeffort: 28,
        assignedto: 'Jamie Walsh', tags: 'docs,user-guide',
        description: 'Step-by-step guides for all major user journeys targeting non-technical audiences.',
    },
    {
        [PRIMARY_ID]: tid(6,2,1), subject: 'Getting started tutorial', [PARENT_ID_VALUE_KEY]: tid(6,2),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 2, percentcomplete: 100,
        scheduledstart: '2025-12-01', scheduledend: '2025-12-20',
        estimatedeffort: 24, actualeffort: 26,
        assignedto: 'Jamie Walsh', tags: 'docs,onboarding',
        description: 'Five-minute quickstart guiding a new user to their first successful action.',
    },
    {
        [PRIMARY_ID]: tid(6,2,2), subject: 'FAQ & troubleshooting guide', [PARENT_ID_VALUE_KEY]: tid(6,2),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 1,
        statuscode: 3, priority: 1, percentcomplete: 20,
        scheduledstart: '2026-01-01', scheduledend: '2026-02-15',
        estimatedeffort: 24, actualeffort: 5,
        assignedto: 'Jamie Walsh', tags: 'docs,support',
        description: 'Curated FAQ derived from support tickets; updated monthly.',
    },
    {
        [PRIMARY_ID]: tid(6,2,3), subject: 'Advanced features guide', [PARENT_ID_VALUE_KEY]: tid(6,2),
        [STACK_RANK_COL]: SEED_RANKS[2], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 1, percentcomplete: 0,
        scheduledstart: '2026-02-16', scheduledend: '2026-03-31',
        estimatedeffort: 32, actualeffort: 0,
        assignedto: 'Jamie Walsh', tags: 'docs,advanced',
        description: 'Deep-dive guides for power users covering workflows, integrations, and automation.',
    },
    {
        [PRIMARY_ID]: tid(6,3), subject: 'Training Programme', [PARENT_ID_VALUE_KEY]: tid(6),
        [STACK_RANK_COL]: SEED_RANKS[2], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 1, percentcomplete: 0,
        scheduledstart: '2026-03-01', scheduledend: '2026-05-31',
        estimatedeffort: 80, actualeffort: 0,
        assignedto: 'Jamie Walsh', tags: 'training',
        description: 'Blended learning programme with videos, live workshops, and assessment quizzes.',
    },
    {
        [PRIMARY_ID]: tid(6,3,1), subject: 'Video tutorials', [PARENT_ID_VALUE_KEY]: tid(6,3),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 1, percentcomplete: 0,
        scheduledstart: '2026-03-01', scheduledend: '2026-04-15',
        estimatedeffort: 40, actualeffort: 0,
        assignedto: 'Jamie Walsh', tags: 'training,video',
        description: 'Ten short-form screencasts covering the most common tasks.',
    },
    {
        [PRIMARY_ID]: tid(6,3,2), subject: 'Interactive workshops', [PARENT_ID_VALUE_KEY]: tid(6,3),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 1, percentcomplete: 0,
        scheduledstart: '2026-04-16', scheduledend: '2026-05-15',
        estimatedeffort: 24, actualeffort: 0,
        assignedto: 'Jamie Walsh', tags: 'training,workshop',
        description: 'Two-hour hands-on sessions for customer success and partner teams.',
    },
    {
        [PRIMARY_ID]: tid(6,3,3), subject: 'Assessment quizzes', [PARENT_ID_VALUE_KEY]: tid(6,3),
        [STACK_RANK_COL]: SEED_RANKS[2], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 0, percentcomplete: 0,
        scheduledstart: '2026-05-16', scheduledend: '2026-05-31',
        estimatedeffort: 8, actualeffort: 0,
        assignedto: 'Jamie Walsh', tags: 'training,assessment',
        description: 'Online quizzes with certificates of completion for each learning module.',
    },
    {
        [PRIMARY_ID]: tid(6,4), subject: 'Localisation', [PARENT_ID_VALUE_KEY]: tid(6),
        [STACK_RANK_COL]: SEED_RANKS[3], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 0, percentcomplete: 0,
        scheduledstart: '2026-04-01', scheduledend: '2026-05-31',
        estimatedeffort: 40, actualeffort: 0,
        assignedto: 'Jamie Walsh', tags: 'i18n,docs',
        description: 'Translate key user guides and in-app strings into Spanish and French.',
    },
    {
        [PRIMARY_ID]: tid(6,4,1), subject: 'Spanish translation', [PARENT_ID_VALUE_KEY]: tid(6,4),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 0, percentcomplete: 0,
        scheduledstart: '2026-04-01', scheduledend: '2026-04-30',
        estimatedeffort: 20, actualeffort: 0,
        assignedto: 'Jamie Walsh', tags: 'i18n,spanish',
        description: 'Professional translation of getting-started guide and UI strings.',
    },
    {
        [PRIMARY_ID]: tid(6,4,2), subject: 'French translation', [PARENT_ID_VALUE_KEY]: tid(6,4),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 0, percentcomplete: 0,
        scheduledstart: '2026-05-01', scheduledend: '2026-05-31',
        estimatedeffort: 20, actualeffort: 0,
        assignedto: 'Jamie Walsh', tags: 'i18n,french',
        description: 'Professional translation of getting-started guide and UI strings.',
    },

    // ═════════════════════════════════════════════════════════════════════════
    // EPIC 7 — Analytics & Reporting
    // ═════════════════════════════════════════════════════════════════════════
    {
        [PRIMARY_ID]: tid(7), subject: 'Analytics & Reporting', [PARENT_ID_VALUE_KEY]: null,
        [STACK_RANK_COL]: SEED_RANKS[6], [STATE_CODE_COL]: 0,
        statuscode: 2, priority: 2, percentcomplete: 25,
        scheduledstart: '2026-01-01', scheduledend: '2026-06-30',
        estimatedeffort: 350, actualeffort: 88,
        assignedto: 'Riley Thompson', tags: 'analytics,data',
        description: 'Build a centralised analytics platform powering executive dashboards, operational reports, and ML forecasting.',
    },
    {
        [PRIMARY_ID]: tid(7,1), subject: 'Data Pipeline', [PARENT_ID_VALUE_KEY]: tid(7),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 0,
        statuscode: 2, priority: 3, percentcomplete: 50,
        scheduledstart: '2026-01-01', scheduledend: '2026-03-31',
        estimatedeffort: 120, actualeffort: 60,
        assignedto: 'Riley Thompson', tags: 'data,pipeline,etl',
        description: 'Ingestion layer from all product databases and third-party tools into a centralised data warehouse.',
    },
    {
        [PRIMARY_ID]: tid(7,1,1), subject: 'ETL pipeline setup', [PARENT_ID_VALUE_KEY]: tid(7,1),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 1,
        statuscode: 5, priority: 3, percentcomplete: 100,
        scheduledstart: '2026-01-01', scheduledend: '2026-02-15',
        estimatedeffort: 60, actualeffort: 65,
        assignedto: 'Riley Thompson', tags: 'etl,data',
        description: 'Apache Airflow DAGs for daily extraction from Postgres, Stripe, and Mixpanel.',
    },
    {
        [PRIMARY_ID]: tid(7,1,2), subject: 'Data warehouse schema design', [PARENT_ID_VALUE_KEY]: tid(7,1),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 0,
        statuscode: 2, priority: 2, percentcomplete: 30,
        scheduledstart: '2026-02-16', scheduledend: '2026-03-31',
        estimatedeffort: 40, actualeffort: 12,
        assignedto: 'Riley Thompson', tags: 'data,warehouse',
        description: 'Star schema design in Snowflake covering orders, users, events, and financials.',
    },
    {
        [PRIMARY_ID]: tid(7,2), subject: 'Dashboards', [PARENT_ID_VALUE_KEY]: tid(7),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 0,
        statuscode: 2, priority: 2, percentcomplete: 20,
        scheduledstart: '2026-03-01', scheduledend: '2026-05-31',
        estimatedeffort: 130, actualeffort: 26,
        assignedto: 'Riley Thompson', tags: 'analytics,dashboard',
        description: 'Self-service dashboards in Metabase for exec, sales, and ops purposes.',
    },
    {
        [PRIMARY_ID]: tid(7,2,1), subject: 'Executive overview dashboard', [PARENT_ID_VALUE_KEY]: tid(7,2),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 0,
        statuscode: 2, priority: 2, percentcomplete: 30,
        scheduledstart: '2026-03-01', scheduledend: '2026-04-15',
        estimatedeffort: 50, actualeffort: 15,
        assignedto: 'Riley Thompson', tags: 'analytics,executive',
        description: 'Revenue, MRR, churn, NPS, and headcount at a glance.',
    },
    {
        [PRIMARY_ID]: tid(7,2,2), subject: 'Sales metrics dashboard', [PARENT_ID_VALUE_KEY]: tid(7,2),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 1, percentcomplete: 0,
        scheduledstart: '2026-04-16', scheduledend: '2026-05-15',
        estimatedeffort: 40, actualeffort: 0,
        assignedto: 'Riley Thompson', tags: 'analytics,sales',
        description: 'Pipeline value, conversion rates, rep leaderboard, and quota attainment.',
    },
    {
        [PRIMARY_ID]: tid(7,2,3), subject: 'Operational KPIs dashboard', [PARENT_ID_VALUE_KEY]: tid(7,2),
        [STACK_RANK_COL]: SEED_RANKS[2], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 1, percentcomplete: 0,
        scheduledstart: '2026-05-16', scheduledend: '2026-05-31',
        estimatedeffort: 32, actualeffort: 0,
        assignedto: 'Riley Thompson', tags: 'analytics,ops',
        description: 'Support ticket volume, resolution time, and incident MTTR.',
    },
    {
        [PRIMARY_ID]: tid(7,3), subject: 'Custom Reports', [PARENT_ID_VALUE_KEY]: tid(7),
        [STACK_RANK_COL]: SEED_RANKS[2], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 1, percentcomplete: 0,
        scheduledstart: '2026-05-01', scheduledend: '2026-06-15',
        estimatedeffort: 60, actualeffort: 0,
        assignedto: 'Riley Thompson', tags: 'analytics,reports',
        description: 'No-code report builder and scheduled PDF/CSV exports for non-analyst users.',
    },
    {
        [PRIMARY_ID]: tid(7,3,1), subject: 'Report builder UI', [PARENT_ID_VALUE_KEY]: tid(7,3),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 1, percentcomplete: 0,
        scheduledstart: '2026-05-01', scheduledend: '2026-05-31',
        estimatedeffort: 40, actualeffort: 0,
        assignedto: 'Alex Chen', tags: 'frontend,analytics',
        description: 'Drag-and-drop query builder with chart types, filters, and calculated fields.',
    },
    {
        [PRIMARY_ID]: tid(7,3,2), subject: 'Scheduled exports', [PARENT_ID_VALUE_KEY]: tid(7,3),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 1, percentcomplete: 0,
        scheduledstart: '2026-06-01', scheduledend: '2026-06-15',
        estimatedeffort: 16, actualeffort: 0,
        assignedto: 'Riley Thompson', tags: 'analytics,automation',
        description: 'Cron-driven email delivery of report snapshots in PDF and CSV formats.',
    },
    {
        [PRIMARY_ID]: tid(7,4), subject: 'ML & Forecasting', [PARENT_ID_VALUE_KEY]: tid(7),
        [STACK_RANK_COL]: SEED_RANKS[3], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 2, percentcomplete: 0,
        scheduledstart: '2026-06-01', scheduledend: '2026-06-30',
        estimatedeffort: 80, actualeffort: 0,
        assignedto: 'Riley Thompson', tags: 'ml,analytics,forecasting',
        description: 'Predictive models for demand forecasting and customer churn embedded in dashboards.',
    },
    {
        [PRIMARY_ID]: tid(7,4,1), subject: 'Demand forecasting model', [PARENT_ID_VALUE_KEY]: tid(7,4),
        [STACK_RANK_COL]: SEED_RANKS[0], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 2, percentcomplete: 0,
        scheduledstart: '2026-06-01', scheduledend: '2026-06-20',
        estimatedeffort: 48, actualeffort: 0,
        assignedto: 'Riley Thompson', tags: 'ml,forecasting',
        description: 'Time-series model (Prophet or LSTM) predicting monthly order volumes by category.',
    },
    {
        [PRIMARY_ID]: tid(7,4,2), subject: 'Churn prediction model', [PARENT_ID_VALUE_KEY]: tid(7,4),
        [STACK_RANK_COL]: SEED_RANKS[1], [STATE_CODE_COL]: 0,
        statuscode: 1, priority: 2, percentcomplete: 0,
        scheduledstart: '2026-06-21', scheduledend: '2026-06-30',
        estimatedeffort: 32, actualeffort: 0,
        assignedto: 'Riley Thompson', tags: 'ml,churn',
        description: 'Binary classifier on user engagement signals; scores surfaced in the exec dashboard.',
    },
];

// ─── Module-level persistent store ───────────────────────────────────────────
// Kept outside the class so data survives instance destruction and recreation.
const _store = new Map<string, IRawRecord>(
    TASKS.map(t => [t[PRIMARY_ID] as string, { ...t }])
);
let _newTaskCount = 0;

// ─── Strategy ─────────────────────────────────────────────────────────────────

export class MemoryTaskStrategy implements ITaskDataProviderStrategy {
    private _data = _store;
    private _templateDataProvider?: IDataProvider;

    constructor(templateDataProvider?: IDataProvider) {
        this._templateDataProvider = templateDataProvider;
    }

    private _provider!: ITaskDataProvider;
    private _taskTree!: IRecordTree;

    // ── ITaskDataProviderStrategy ────────────────────────────────────────────

    public async onInitialize(provider: ITaskDataProvider) {
        this._provider = provider;
        this._taskTree = provider.getRecordTree();
        return {
            columns: this._enrichColumns(this._provider.getColumns()),
            rawData: [...this._data.values()],
            metadata: ENTITY_METADATA,
        };
    }

    /**
     * Enriches columns from the provider (e.g. stored in a user query) with
     * full definitions from the global COLUMNS store. Properties already
     * present on the stored column take precedence; missing ones (such as
     * displayName and metadata) are filled in from COLUMNS.
     */
    private _enrichColumns(columns: IColumn[]): IColumn[] {
        return columns.map(column => {
            const fullColumn = COLUMNS.find(c => c.name === column.name);
            if (!fullColumn) return column;
            return { 
                ...fullColumn, 
                ...column,
                metadata: {
                    ...fullColumn.metadata,
                    ...column.metadata
                } 
            };
        });
    }

    public async onGetRawRecords(ids: string[]): Promise<IRawRecord[]> {
        return ids.flatMap(id => {
            const record = this._data.get(id);
            return record ? [record] : [];
        });
    }

    public async onGetAvailableColumns(_options?: IAvailableColumnOptions): Promise<IColumn[]> {
        return COLUMNS.filter(c => !c.isHidden);
    }

    public async onGetAvailableRelatedColumns(): Promise<IAvailableRelatedColumn[]> {
        return [];
    }

    public onGetQuickFindColumns(): string[] {
        return [SUBJECT_COL, 'assignedto', 'tags'];
    }

    public async onCreateTask(parentTaskId?: string): Promise<IRawRecord | null> {
        const id = this._generateId();
        ++_newTaskCount;
        // Prepend to the top of the group (or list if no parent).
        const siblings = [...this._data.values()]
            .filter(t => ((t[PARENT_ID_VALUE_KEY] as string) ?? null) === (parentTaskId ?? null));
        const minRank = siblings.reduce(
            (min, t) => { const r = t[STACK_RANK_COL] as string; return r < min ? r : min; },
            LEXO_MAX
        );
        const newTask: IRawRecord = {
            [PRIMARY_ID]: id,
            [SUBJECT_COL]: `New Task ${_newTaskCount}`,
            [PARENT_ID_VALUE_KEY]: parentTaskId ?? null,
            [STACK_RANK_COL]: siblings.length === 0 ? SEED_RANKS[0] : lexoRankBefore(minRank),
            [STATE_CODE_COL]: 0,
            statuscode: 1,
            priority: 1,
            percentcomplete: 0,
            estimatedeffort: 8,
            actualeffort: 0,
            assignedto: null,
            tags: null,
            description: null,
            scheduledstart: null,
            scheduledend: null,
        };
        this._data.set(id, newTask);
        return newTask;
    }

    public async onDeleteTasks(taskIds: string[]): Promise<IDeleteTasksResult> {
        const toDelete = new Set<string>();
        for (const id of taskIds) {
            this._collectDescendants(id, toDelete);
        }
        const deletedTaskIds: string[] = [];
        for (const id of toDelete) {
            if (this._data.delete(id)) {
                deletedTaskIds.push(id);
            }
        }
        return { success: true, deletedTaskIds };
    }

    private _collectDescendants(id: string, result: Set<string>): void {
        result.add(id);
        const node = this._taskTree.getNode(id);
        for (const child of node?.directChildren ?? []) {
            this._collectDescendants(child.getRecordId(), result);
        }
    }

    public async onCreateTemplateFromTask(taskId: string): Promise<IRawRecord | null> {
        const task = this._data.get(taskId);
        if (!task) return null;

        const templateId = this._generateId();
        const template: IRawRecord = {
            mem_templateid: templateId,
            [SUBJECT_COL]: task[SUBJECT_COL] ?? null,
            description: task['description'] ?? null,
        };

        // Recursively capture the full task hierarchy as template nodes.
        const buildNodes = (id: string): ITemplateNode[] =>
            (this._taskTree.getNode(id)?.directChildren ?? []).map(c => {
                const child = this._data.get(c.getRecordId());
                return {
                    subject: (child?.[SUBJECT_COL] as string) ?? '',
                    description: (child?.['description'] as string) ?? null,
                    children: buildNodes(c.getRecordId()),
                };
            });

        const nodes = buildNodes(taskId);
        if (nodes.length > 0) {
            _TEMPLATE_CHILDREN[templateId] = nodes;
        }

        // Persist in the module-level array so re-created providers and strategies
        // always start with the full set of templates.
        SAMPLE_TEMPLATES.push(template);

        // Update the live provider immediately so the picker reflects the new
        // template without requiring a full re-mount.
        this._templateDataProvider?.setDataSource(SAMPLE_TEMPLATES);

        return template;
    }

    public async onCreateTasksFromTemplate(templateId: string, parentTaskId?: string): Promise<IRawRecord[] | null> {
        const template = this._templateDataProvider?.getRecordsMap()[templateId]?.getRawData();
        if (!template) return null;

        const created: IRawRecord[] = [];

        // Compute a rank that prepends to the existing siblings.
        const topSiblings = [...this._data.values()]
            .filter(t => ((t[PARENT_ID_VALUE_KEY] as string) ?? null) === (parentTaskId ?? null));
        const topMinRank = topSiblings.reduce(
            (min, t) => { const r = t[STACK_RANK_COL] as string; return r < min ? r : min; },
            LEXO_MAX
        );

        // Create the root task from the template.
        const rootId = this._generateId();
        ++_newTaskCount;
        const rootTask: IRawRecord = {
            [PRIMARY_ID]: rootId,
            [SUBJECT_COL]: template[SUBJECT_COL] as string,
            [PARENT_ID_VALUE_KEY]: parentTaskId ?? null,
            [STACK_RANK_COL]: topSiblings.length === 0 ? SEED_RANKS[0] : lexoRankBefore(topMinRank),
            [STATE_CODE_COL]: 0,
            statuscode: 1,
            priority: 1,
            percentcomplete: 0,
            estimatedeffort: null,
            actualeffort: 0,
            assignedto: null,
            tags: null,
            description: template['description'] ?? null,
            scheduledstart: null,
            scheduledend: null,
        };
        this._data.set(rootId, rootTask);
        created.push(rootTask);

        // Recursively create the full child hierarchy from the template nodes.
        const createNodes = (nodes: ITemplateNode[], parentId: string) => {
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                const childId = this._generateId();
                ++_newTaskCount;
                const childTask: IRawRecord = {
                    [PRIMARY_ID]: childId,
                    [SUBJECT_COL]: node.subject,
                    [PARENT_ID_VALUE_KEY]: parentId,
                    [STACK_RANK_COL]: SEED_RANKS[i] ?? lexoRankAfter(SEED_RANKS[SEED_RANKS.length - 1]),
                    [STATE_CODE_COL]: 0,
                    statuscode: 1,
                    priority: 1,
                    percentcomplete: 0,
                    estimatedeffort: null,
                    actualeffort: 0,
                    assignedto: null,
                    tags: null,
                    description: node.description ?? null,
                    scheduledstart: null,
                    scheduledend: null,
                };
                this._data.set(childId, childTask);
                created.push(childTask);
                if (node.children.length > 0) {
                    createNodes(node.children, childId);
                }
            }
        };

        createNodes(_TEMPLATE_CHILDREN[templateId] ?? [], rootId);

        return created;
    }

    public async onEditTasks(_taskIds: string[]): Promise<IEditTasksResult | null> {
        // In-memory variant — editing happens inline in the grid; no modal needed.
        return null;
    }

    public async onMoveTask(
        movingTaskId: string,
        targetTaskId: string,
        position: 'above' | 'below' | 'child',
    ): Promise<IRawRecord[] | null> {
        const moving = this._data.get(movingTaskId);
        const target = this._data.get(targetTaskId);
        if (!moving || !target) return null;

        if (position === 'child') {
            // Prepend as first child of target using the task tree.
            const children = this._taskTree.getNode(targetTaskId)?.directChildren ?? [];
            const minRank = children
                .map(c => this._data.get(c.getRecordId())?.[STACK_RANK_COL] as string)
                .filter(Boolean)
                .reduce((min, r) => (r < min ? r : min), LEXO_MAX);
            moving[PARENT_ID_VALUE_KEY] = targetTaskId;
            moving[STACK_RANK_COL] = children.length === 0 ? SEED_RANKS[0] : lexoRankBefore(minRank);
            this._data.set(movingTaskId, moving);
            return [moving];
        }

        // above / below: compute a rank between the target's neighbours using the task tree.
        const targetParentId = (target[PARENT_ID_VALUE_KEY] as string) ?? null;
        moving[PARENT_ID_VALUE_KEY] = targetParentId;

        const sortedSiblings = (this._taskTree.getNode(targetParentId)?.directChildren ?? [])
            .filter(c => c.getRecordId() !== movingTaskId)
            .map(c => this._data.get(c.getRecordId())!)
            .filter(Boolean);

        const targetRank = target[STACK_RANK_COL] as string;
        const targetIdx = sortedSiblings.findIndex(t => t[PRIMARY_ID] === targetTaskId);
        let newRank: string;
        if (position === 'above') {
            const prev = sortedSiblings[targetIdx - 1];
            newRank = lexoRankBetween(prev ? prev[STACK_RANK_COL] as string : LEXO_MIN, targetRank);
        } else {
            const next = sortedSiblings[targetIdx + 1];
            newRank = lexoRankBetween(targetRank, next ? next[STACK_RANK_COL] as string : LEXO_MAX);
        }

        moving[STACK_RANK_COL] = newRank;
        this._data.set(movingTaskId, moving);
        return [moving];
    }

    public async onRecordSave(record: IRecord): Promise<IRecordSaveOperationResult> {
        const id = record.getRecordId();
        const existing = this._data.get(id);
        if (!existing) {
            return { recordId: id, success: false, fields: [], errors: [{ message: `Task ${id} not found` }] };
        }

        const updatedFields: string[] = [];
        const editable = [
            SUBJECT_COL, 'description', 'statuscode', 'priority',
            'scheduledstart', 'scheduledend', 'estimatedeffort',
            'actualeffort', PERCENT_COMPLETE_COL, 'assignedto', 'tags',
            STATE_CODE_COL,
        ];

        for (const col of editable) {
            const val = (record as any).getValue?.(col);
            if (val !== undefined) {
                existing[col] = val;
                updatedFields.push(col);
            }
        }

        this._data.set(id, existing);
        return { recordId: id, success: true, fields: updatedFields };
    }

    public onIsRecordActive(recordId: string): boolean {
        const statuscode = this._data.get(recordId)?.['statuscode'] as number ?? 1;
        return statuscode != 5 && statuscode != 6; // Completed and Cancelled are inactive
    }

    public onOpenDatasetItem(_entityReference: ComponentFramework.EntityReference): void {
        // No-op for the in-memory variant.
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private _generateId(): string {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        // Fallback for environments without crypto.randomUUID
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }
}
