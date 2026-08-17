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
    ICreateTaskParameters,
    IDeleteTasksResult,
    IMoveTaskParameters,
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
        //await new Promise(resolve => setTimeout(resolve, 5000)); // simulate async initialization
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

    public async onCreateTask(params: ICreateTaskParameters): Promise<IRawRecord | null> {
        const name = window.prompt('Enter a name for the new task:');
        if(!name) return null;
        const parentTaskId = params?.parentId;
        const previousTaskId = params?.previousTaskId;
        const nextTaskId = params?.nextTaskId;
        const id = this._generateId();
        ++_newTaskCount;
        const newTask: IRawRecord = {
            [SUBJECT_COL]: name,
            [PRIMARY_ID]: id,
            [PARENT_ID_VALUE_KEY]: parentTaskId ?? null,
            [STACK_RANK_COL]: this._getNewTaskStackRank(parentTaskId, previousTaskId, nextTaskId),
            [STATE_CODE_COL]: 0,
            statuscode: 1,
            priority: 1,
            percentcomplete: 0,
            estimatedeffort: 8,
            actualeffort: 0,
            assignedto: null,
            tags: null,
            description: null,
            scheduledstart: params?.data?.scheduledstart ?? this._getDefaultDate(parentTaskId, 'startDate'),
            scheduledend: params?.data?.scheduledend ?? this._getDefaultDate(parentTaskId, 'endDate'),
        };
        this._data.set(id, newTask);
        return newTask;
    }

    private _getNewTaskStackRank(parentTaskId?: string, previousTaskId?: string, nextTaskId?: string): string {
        const previousRank = previousTaskId ? this._data.get(previousTaskId)?.[STACK_RANK_COL] as string | undefined : undefined;
        const nextRank = nextTaskId ? this._data.get(nextTaskId)?.[STACK_RANK_COL] as string | undefined : undefined;

        if (previousRank && nextRank) {
            return LexoRank.parse(previousRank).between(LexoRank.parse(nextRank)).format();
        }

        if (nextRank) {
            return LexoRank.parse(nextRank).genPrev().format();
        }

        if (previousRank) {
            return LexoRank.parse(previousRank).genNext().format();
        }

        return SEED_RANKS[0];
    }

    private _getDefaultDate(parentId: string | undefined, type: 'startDate' | 'endDate'): Date {
        let date: Date | null = null;

        if (parentId) {
            date = this._parseDate(this._getTaskDate(parentId, type));
        }
        else if (this._provider.getProjectDataProvider()) {
            const projectDataProvider = this._provider.getProjectDataProvider();
            date = type === 'startDate'
                ? projectDataProvider?.getProjectStartDate() ?? null
                : projectDataProvider?.getProjectEndDate() ?? null;
        }

        return date ?? new Date();
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

    public async onMoveTask(parameters: IMoveTaskParameters): Promise<IRawRecord[] | null> {
        const { movingTaskId, parentId, newPreviousSiblingTaskId, newNextSiblingTaskId } = parameters;
        const moving = this._data.get(movingTaskId);
        if (!moving) return null;

        moving[PARENT_ID_VALUE_KEY] = parentId ?? null;
        moving[STACK_RANK_COL] = this._getNewTaskStackRank(parentId, newPreviousSiblingTaskId, newNextSiblingTaskId);
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
