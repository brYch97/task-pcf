import { IColumn, IMemoryProviderEntityMetadata, MemoryDataProvider } from "@talxis/client-libraries";
import { INativeColumns, ITaskGridDescriptor, ITaskGridParameters, ITaskStrategyDeps } from "@talxis/base-controls";
import {
    IDeletedUserQueriesResult,
    ISavedQuery,
    ISavedQueryStrategy,
} from "@talxis/base-controls/dist/components/TaskGrid/data-providers";
import {
    COLUMNS,
    PARENT_ID_COL,
    PATH_COL,
    PERCENT_COMPLETE_COL,
    SAMPLE_TEMPLATES,
    STACK_RANK_COL,
    STATE_CODE_COL,
    SUBJECT_COL,
    TEMPLATE_METADATA,
    MemoryTaskStrategy,
} from "./MemoryTaskStrategy";

// ─── User-query data-provider metadata ───────────────────────────────────────

const USER_QUERY_METADATA: IMemoryProviderEntityMetadata = {
    PrimaryIdAttribute: 'queryid',
    LogicalName: 'mem_userquery',
    QuickFindColumns: ['name'],
};

const USER_QUERY_COLUMNS: IColumn[] = [
    { name: 'queryid', dataType: 'SingleLine.Text', displayName: 'ID', isHidden: true },
    { name: 'name', dataType: 'SingleLine.Text', displayName: 'Name', visualSizeFactor: 200 }
];

const TEMPLATE_COLUMNS: IColumn[] = [
    { name: 'mem_templateid', dataType: 'SingleLine.Text', displayName: 'ID', isHidden: true },
    { name: 'subject', dataType: 'SingleLine.Text', displayName: 'Subject', visualSizeFactor: 200 },
    { name: 'description', dataType: 'Multiple', displayName: 'Description', visualSizeFactor: 300 },
];

// ─── Descriptor ───────────────────────────────────────────────────────────────

export class MemoryDescriptor implements ITaskGridDescriptor {
    private _userQueryDataProvider?: MemoryDataProvider;

    /** In-memory store for user-created saved queries. */
    private _userQueries: ISavedQuery[] = [
        {
            id: 'uq-default-01-0000-0000-000000000000',
            name: 'My Open Tasks',
            isFlatListEnabled: false,
            columns: COLUMNS.filter(c =>
                c.isHidden ||
                ['subject', 'statuscode', 'priority', 'scheduledend', 'assignedto'].includes(c.name)
            ),
            filtering: {
                filterOperator: 1, // And
                conditions: [
                    {
                        attributeName: STATE_CODE_COL,
                        conditionOperator: 0, // Equal
                        value: '0',
                    },
                ],
            },
        },
        {
            id: 'uq-default-02-0000-0000-000000000000',
            name: 'High Priority',
            isFlatListEnabled: false,
            columns: COLUMNS.filter(c =>
                c.isHidden ||
                ['subject', 'priority', 'scheduledend', 'estimatedeffort', 'assignedto', 'tags'].includes(c.name)
            ),
            filtering: {
                filterOperator: 1, // And
                conditions: [
                    {
                        attributeName: 'priority',
                        conditionOperator: 0, // Equal
                        value: '2', // High
                    },
                ],
            },
        },
    ];

    // ── ITaskGridDescriptor ──────────────────────────────────────────────────

    public onGetNativeColumns(): INativeColumns {
        return {
            subject: SUBJECT_COL,
            parentId: PARENT_ID_COL,
            stackRank: STACK_RANK_COL,
            path: PATH_COL,
            stateCode: STATE_CODE_COL,
            percentComplete: PERCENT_COMPLETE_COL,
        };
    }

    public onCreateTaskStrategy(deps: ITaskStrategyDeps) {
        return new MemoryTaskStrategy(deps.templateDataProvider);
    }

    public onCreateSavedQueryStrategy(): ISavedQueryStrategy {
        return {
            onGetSystemQueries: async (): Promise<ISavedQuery[]> => [
                {
                    id: '00000000-0000-0000-0000-000000000000',
                    name: 'All Tasks',
                    isFlatListEnabled: false,
                    columns: COLUMNS.filter(c =>
                        c.isHidden ||
                        ['subject', 'statuscode', 'priority', 'scheduledend', 'estimatedeffort', 'percentcomplete', 'assignedto', 'tags'].includes(c.name)
                    ),
                },
            ],
            onGetUserQueries: async (): Promise<ISavedQuery[]> => {
                return [...this._userQueries];
            },

            onCreateUserQuery: async (
                newQuery: { name: string; description?: string },
                currentQuery: ISavedQuery,
            ): Promise<string | null> => {
                const id = this._generateId();
                const created: ISavedQuery = {
                    ...currentQuery,
                    id,
                    name: newQuery.name,
                };
                this._userQueries.push(created);
                return id;
            },

            onUpdateUserQuery: async (currentQuery: ISavedQuery): Promise<string | null> => {
                const idx = this._userQueries.findIndex(q => q.id === currentQuery.id);
                if (idx >= 0) {
                    this._userQueries[idx] = { ...currentQuery };
                }
                return currentQuery.id;
            },

            onDeleteUserQueries: async (queryIds: string[]): Promise<IDeletedUserQueriesResult> => {
                const deletedQueryIds: string[] = [];
                for (const id of queryIds) {
                    const idx = this._userQueries.findIndex(q => q.id === id);
                    if (idx >= 0) {
                        this._userQueries.splice(idx, 1);
                        deletedQueryIds.push(id);
                    }
                }
                if (deletedQueryIds.length > 0) {
                    await this._userQueryDataProvider?.deleteRecords(deletedQueryIds);
                }
                return { success: true, deletedQueryIds };
            },
        };
    }

    public onCreateUserQueryDataProvider() {
        const provider = new MemoryDataProvider({
            dataSource: this._userQueries.map(q => ({ queryid: q.id, name: q.name })),
            metadata: USER_QUERY_METADATA,
        });
        provider.setColumns(USER_QUERY_COLUMNS);
        provider.addEventListener('onAfterRecordSaved', (result) => {
            if(result.success) {
                const updatedQuery = this._userQueries.find(q => q.id === result.recordId);
                if(updatedQuery) {
                    updatedQuery.name = provider.getRecordsMap()[result.recordId].getValue('name');
                }
            }
        })
        this._userQueryDataProvider = provider;
        return provider;
    }

    public onCreateTemplateDataProvider() {
        const provider = new MemoryDataProvider({
            dataSource: SAMPLE_TEMPLATES,
            metadata: TEMPLATE_METADATA,
        });
        provider.setColumns(TEMPLATE_COLUMNS);
        return provider;
    }

    public onGetGridParameters(): ITaskGridParameters {
        return {
            height: '600px',
            enableRowDragging: true,
            enableEditColumns: true,
            enableShowHierarchyToggle: true,
            enableHideInactiveTasksToggle: true,
            enableEditColumnsScopeSelector: false,
        };
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private _generateId(): string {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }
}
