import {
    IAvailableColumnOptions,
    IAvailableRelatedColumn,
    IColumn,
    IDataProvider,
    IRawRecord,
    IRecord,
    IRecordSaveOperationResult,
} from "@talxis/client-libraries";
import {
    IDeleteTasksResult,
    IOpenDatasetItemsResult,
    ITaskDataProvider,
    ITaskDataProviderStrategy,
} from "@talxis/base-controls/dist/components/TaskGrid/providers";
import { IRecordTree } from "@talxis/base-controls/dist/components/TaskGrid/providers/task/record-tree";
import { LexoRank } from "lexorank";
import {
    COLUMNS,
    ENTITY_METADATA,
    ITemplateNode,
    PARENT_ID_VALUE_KEY,
    PERCENT_COMPLETE_COL,
    PRIMARY_ID,
    SAMPLE_TEMPLATES,
    SEED_RANKS,
    STATE_CODE_COL,
    STACK_RANK_COL,
    SUBJECT_COL,
    _TEMPLATE_CHILDREN,
    _store,
} from "./MemoryTaskData";
import { ITaskStrategyDeps } from "@talxis/base-controls";

export {
    COLUMNS,
    DEFAULT_QUERY_COLUMNS,
    ENTITY_METADATA,
    ENTITY_NAME,
    PARENT_ID_COL,
    PARENT_ID_VALUE_KEY,
    PERCENT_COMPLETE_COL,
    PRIMARY_ID,
    SAMPLE_TEMPLATES,
    STACK_RANK_COL,
    STATE_CODE_COL,
    SUBJECT_COL,
    TEMPLATE_ENTITY_NAME,
    TEMPLATE_METADATA,
} from "./MemoryTaskData";

let _newTaskCount = 0;


interface IMemoryTaskStrategyParams {
    deps: ITaskStrategyDeps;
}
// ─── Strategy ─────────────────────────────────────────────────────────────────

export class MemoryTaskStrategy implements ITaskDataProviderStrategy {
    private _data = _store;
    private _templateDataProvider?: IDataProvider;
    private _isTaskEditingEnabled = false;

    constructor(deps: ITaskStrategyDeps) {
        this._templateDataProvider = deps.templateDataProvider;
        this._isTaskEditingEnabled = deps.enableTaskEditing ?? false;
    }

    private _provider!: ITaskDataProvider;
    private _taskTree!: IRecordTree;

    // ── ITaskDataProviderStrategy ────────────────────────────────────────────

    public async onInitialize(provider: ITaskDataProvider) {
        this._provider = provider;
        this._taskTree = provider.getRecordTree();
        return {
            columns: this._provider.getColumns(),
            rawData: [...this._data.values()],
            metadata: ENTITY_METADATA,
        };
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

    public async onCreateTask(parentTaskId?: string): Promise<IRawRecord | null> {
        const id = this._generateId();
        ++_newTaskCount;
        // Prepend to the top of the group (or list if no parent).
        const siblings = [...this._data.values()]
            .filter(t => ((t[PARENT_ID_VALUE_KEY] as string) ?? null) === (parentTaskId ?? null));
        const minRankEntry = siblings.reduce<string | null>(
            (min, t) => {
                const r = t[STACK_RANK_COL] as string;
                if (!r) return min;
                return min === null || LexoRank.parse(r).compareTo(LexoRank.parse(min)) < 0 ? r : min;
            },
            null,
        );
        const { start, end } = this._getNewTaskStartDateEndDate(parentTaskId);
        const newTask: IRawRecord = {
            [PRIMARY_ID]: id,
            [PARENT_ID_VALUE_KEY]: parentTaskId ?? null,
            [STACK_RANK_COL]: minRankEntry === null ? SEED_RANKS[0] : LexoRank.parse(minRankEntry).genPrev().format(),
            [STATE_CODE_COL]: 0,
            statuscode: 1,
            priority: 1,
            percentcomplete: 0,
            estimatedeffort: 8,
            actualeffort: 0,
            assignedto: null,
            tags: null,
            description: null,
            scheduledstart: start,
            scheduledend: end,
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

    /** Fallback task span (one day) used when no existing task has measurable dates. */
    private static readonly _DEFAULT_TASK_DURATION_MS = 24 * 60 * 60 * 1000;

    /**
     * Computes a meaningful start/end date (yyyy-mm-dd) for a task being created
     * under `parentTaskId`. The start date is anchored to existing context and the
     * end date is derived from the average duration of comparable tasks.
     */
    private _getNewTaskStartDateEndDate(parentTaskId?: string): { start: string; end: string } {
        const startDate = this._resolveNewTaskStartDate(parentTaskId);
        const durationMs = this._resolveTaskDuration(parentTaskId);
        const endDate = new Date(startDate.getTime() + durationMs);
        return {
            start: this._formatDate(startDate),
            end: this._formatDate(endDate),
        };
    }

    /**
     * Picks a start date for the new task:
     * 1. align with the earliest existing sibling, otherwise
     * 2. inherit the parent task's start date, otherwise
     * 3. fall back to today.
     */
    private _resolveNewTaskStartDate(parentTaskId?: string): Date {
        const siblingIds = (this._taskTree.getNode(parentTaskId ?? null)?.directChildren ?? [])
            .map(c => c.getRecordId());
        const earliestSiblingStart = this._getEarliestStartDate(siblingIds);
        if (earliestSiblingStart) {
            return earliestSiblingStart;
        }

        if (parentTaskId) {
            const parentStart = this._parseDate(this._getTaskDate(parentTaskId, 'startDate'));
            if (parentStart) {
                return parentStart;
            }
        }

        return new Date();
    }

    /**
     * Estimates a task duration from existing data, widening the search until a
     * measurable average is found:
     * 1. the average of the group's own tasks, otherwise
     * 2. the average of the parent's sibling level (the grandparent's children), otherwise
     * 3. the average across every task, otherwise
     * 4. a single-day default.
     */
    private _resolveTaskDuration(parentTaskId?: string): number {
        const ownAverage = this._getAverageDuration(parentTaskId ?? null);
        if (ownAverage !== null) {
            return ownAverage;
        }

        if (parentTaskId) {
            const grandParentId = this._getParentId(parentTaskId);
            const peerAverage = this._getAverageDuration(grandParentId);
            if (peerAverage !== null) {
                return peerAverage;
            }
        }

        const globalAverage = this._getAverageDuration(null, true);
        if (globalAverage !== null) {
            return globalAverage;
        }

        return MemoryTaskStrategy._DEFAULT_TASK_DURATION_MS;
    }

    /**
     * Average duration (ms) of the direct children of `parentId`, or of every task
     * when `allTasks` is set. Returns `null` when no task has a measurable span.
     */
    private _getAverageDuration(parentId: string | null, allTasks = false): number | null {
        const taskIds = allTasks
            ? [...this._data.keys()]
            : (this._taskTree.getNode(parentId ?? null)?.directChildren ?? []).map(c => c.getRecordId());

        let totalDurationMs = 0;
        let durationCount = 0;

        for (const taskId of taskIds) {
            const startDate = this._parseDate(this._getTaskDate(taskId, 'startDate'));
            const endDate = this._parseDate(this._getTaskDate(taskId, 'endDate'));
            if (!startDate || !endDate || endDate < startDate) {
                continue;
            }
            totalDurationMs += endDate.getTime() - startDate.getTime();
            durationCount += 1;
        }

        return durationCount === 0 ? null : totalDurationMs / durationCount;
    }

    private _getEarliestStartDate(taskIds: string[]): Date | null {
        let earliest: Date | null = null;
        for (const taskId of taskIds) {
            const startDate = this._parseDate(this._getTaskDate(taskId, 'startDate'));
            if (startDate && (!earliest || startDate < earliest)) {
                earliest = startDate;
            }
        }
        return earliest;
    }

    private _getParentId(taskId: string): string | null {
        return (this._data.get(taskId)?.[PARENT_ID_VALUE_KEY] as string) ?? null;
    }

    private _parseDate(value: string | null): Date | null {
        if (!value) {
            return null;
        }
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    private _formatDate(date: Date): string {
        return date.toISOString().slice(0, 10);
    }

    private _getTaskDate(taskId: string, type: 'startDate' | 'endDate'): string | null {
        const record = this._provider.getRecordsMap()[taskId];
        const dateColumnName = this._provider.getNativeColumns()[type];
        if (!record || !dateColumnName) {
            return null;
        }

        return record.getValue(dateColumnName);
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
        const topMinRankEntry = topSiblings.reduce<string | null>(
            (min, t) => {
                const r = t[STACK_RANK_COL] as string;
                if (!r) return min;
                return min === null || LexoRank.parse(r).compareTo(LexoRank.parse(min)) < 0 ? r : min;
            },
            null,
        );

        // Create the root task from the template.
        const rootId = this._generateId();
        ++_newTaskCount;
        const rootTask: IRawRecord = {
            [PRIMARY_ID]: rootId,
            [SUBJECT_COL]: template[SUBJECT_COL] as string,
            [PARENT_ID_VALUE_KEY]: parentTaskId ?? null,
            [STACK_RANK_COL]: topMinRankEntry === null ? SEED_RANKS[0] : LexoRank.parse(topMinRankEntry).genPrev().format(),
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
                    [STACK_RANK_COL]: SEED_RANKS[i] ?? LexoRank.parse(SEED_RANKS[SEED_RANKS.length - 1]).genNext().format(),
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

    public async onOpenDatasetItems(entityReferences: ComponentFramework.EntityReference[], isTaskEntity: boolean): Promise<IOpenDatasetItemsResult | null> {
        const mode = this._isTaskEditingEnabled ? 'edit mode' : 'read-only mode';
        alert(`Open ${isTaskEntity ? 'tasks' : 'related records'} (${mode}): ${entityReferences.map(r => r.name).join(', ')}`);
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
            const childRanks = children
                .map(c => this._data.get(c.getRecordId())?.[STACK_RANK_COL] as string)
                .filter(Boolean);
            const minChildRank = childRanks.length === 0 ? null : childRanks.reduce((min, r) =>
                LexoRank.parse(r).compareTo(LexoRank.parse(min)) < 0 ? r : min);
            moving[PARENT_ID_VALUE_KEY] = targetTaskId;
            moving[STACK_RANK_COL] = minChildRank === null ? SEED_RANKS[0] : LexoRank.parse(minChildRank).genPrev().format();
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
            if (prev) {
                newRank = LexoRank.parse(prev[STACK_RANK_COL] as string).between(LexoRank.parse(targetRank)).format();
            } else {
                newRank = LexoRank.parse(targetRank).genPrev().format();
            }
        } else {
            const next = sortedSiblings[targetIdx + 1];
            if (next) {
                newRank = LexoRank.parse(targetRank).between(LexoRank.parse(next[STACK_RANK_COL] as string)).format();
            } else {
                newRank = LexoRank.parse(targetRank).genNext().format();
            }
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

    /**
     * Auto-scheduling engine — called after a task's dates change.
     *
     * Rules (matching Bryntum Gantt auto-schedule behaviour):
     *
     *  1. PARENT MOVE — if the changed task has children and its start date
     *     shifted, ALL descendants are moved by the same offset (ms delta),
     *     preserving their relative positions to each other.
     *
     *  2. ANCESTOR ROLL-UP — after any date change (on the leaf or after the
     *     child shift above), every ancestor in the chain is recalculated so
     *     that its bounds equal min(children.start) → max(children.end).
     *     This propagates all the way to the root.
     *
     *  3. NO CLAMPING — children are never blocked from going before or after
     *     a parent's current span; the parent simply expands / contracts to fit.
     *
     * TODO: finish-to-start dependency propagation (push successors when a
     *       predecessor's end date moves).
     *
     * @returns All IRawRecord objects whose dates were mutated as a side-effect.
     */
    private _autoSchedule(changedTaskId: string, previousStart: string | null): IRawRecord[] {
        const changed: IRawRecord[] = [];

        // ── Rule 1: parent move → shift all descendants by the same delta ────
        const hasChildren = (this._taskTree.getNode(changedTaskId)?.directChildren ?? []).length > 0;
        if (previousStart !== null && hasChildren) {
            const newStart = this._data.get(changedTaskId)?.scheduledstart as string ?? null;
            const prevDate = this._parseDate(previousStart);
            const newDate = this._parseDate(newStart);
            if (prevDate && newDate) {
                const offsetMs = newDate.getTime() - prevDate.getTime();
                if (offsetMs !== 0) {
                    this._shiftDescendants(changedTaskId, offsetMs, changed);
                }
            }
        }

        // ── Rule 2: roll up bounds through every ancestor ─────────────────────
        let ancestorId = this._getParentId(changedTaskId);
        while (ancestorId) {
            const ancestor = this._data.get(ancestorId);
            if (!ancestor) break;

            const childIds = (this._taskTree.getNode(ancestorId)?.directChildren ?? [])
                .map(c => c.getRecordId());

            const bounds = this._getChildDateBounds(childIds);
            if (!bounds) {
                ancestorId = this._getParentId(ancestorId);
                continue;
            }

            const newStart = this._formatDate(bounds.start);
            const newEnd = this._formatDate(bounds.end);
            let dirty = false;

            if (ancestor.scheduledstart !== newStart) {
                ancestor.scheduledstart = newStart;
                dirty = true;
            }
            if (ancestor.scheduledend !== newEnd) {
                ancestor.scheduledend = newEnd;
                dirty = true;
            }

            if (dirty) {
                this._data.set(ancestorId, ancestor);
                changed.push(ancestor);
            }

            ancestorId = this._getParentId(ancestorId);
        }

        // TODO: Rule 3 — finish-to-start dependency propagation (successors)

        return changed;
    }

    /**
     * Recursively shifts every descendant of `parentId` by `offsetMs`,
     * recording each mutated record in `changed`.
     */
    private _shiftDescendants(parentId: string, offsetMs: number, changed: IRawRecord[]): void {
        const children = this._taskTree.getNode(parentId)?.directChildren ?? [];
        for (const child of children) {
            const childId = child.getRecordId();
            const rec = this._data.get(childId);
            if (!rec) continue;

            const startDate = this._parseDate(rec.scheduledstart as string ?? null);
            const endDate = this._parseDate(rec.scheduledend as string ?? null);
            let dirty = false;

            if (startDate) {
                rec.scheduledstart = this._formatDate(new Date(startDate.getTime() + offsetMs));
                dirty = true;
            }
            if (endDate) {
                rec.scheduledend = this._formatDate(new Date(endDate.getTime() + offsetMs));
                dirty = true;
            }

            if (dirty) {
                this._data.set(childId, rec);
                changed.push(rec);
            }

            // Recurse into grandchildren
            this._shiftDescendants(childId, offsetMs, changed);
        }
    }

    private _getChildDateBounds(taskIds: string[]): { start: Date; end: Date } | null {
        let minStart: Date | null = null;
        let maxEnd: Date | null = null;

        for (const taskId of taskIds) {
            const rawRecord = this._data.get(taskId);
            const startDate = this._parseDate(rawRecord?.scheduledstart as string ?? null);
            const endDate = this._parseDate(rawRecord?.scheduledend as string ?? null);

            if (startDate && (!minStart || startDate < minStart)) {
                minStart = startDate;
            }
            if (endDate && (!maxEnd || endDate > maxEnd)) {
                maxEnd = endDate;
            }
        }

        if (!minStart || !maxEnd) return null;
        return { start: minStart, end: maxEnd };
    }

    public onIsRecordActive(recordId: string): boolean {
        const statuscode = this._data.get(recordId)?.['statuscode'] as number ?? 1;
        return statuscode != 5 && statuscode != 6; // Completed and Cancelled are inactive
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
