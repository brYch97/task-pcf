import { IGridCustomizer, IGridCustomizerStrategy, ColDef } from "@talxis/base-controls/dist/components/TaskGrid/components/grid/grid-customizer/GridCustomizer";
import { MemoryLookupManyCellRenderer } from "./MemoryLookupManyCellRenderer";

const LOOKUP_MANY_COLUMNS = new Set(['assignedto', 'tags']);

export class MemoryGridCustomizerStrategy implements IGridCustomizerStrategy {
    private _customizer!: IGridCustomizer;

    public onInitialize(customizer: IGridCustomizer): void {
        this._customizer = customizer;

        customizer.getTaskDataProvider().addEventListener('onRecordLoaded', (record) => {
            this._customizer.registerExpressionDecorator('scheduledend', () => {
                record.expressions.ui.setCustomFormattingExpression('scheduledend', (theme) => {
                    if (!record.isActive()) return undefined;
                    const raw = record.getValue('scheduledend');
                    if (!raw) return undefined;
                    const dueDate = new Date(raw as string);
                    dueDate.setHours(0, 0, 0, 0);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    return dueDate < today
                        ? { backgroundColor: theme.semanticColors.errorBackground }
                        : undefined;
                });
            });
        });
    }

    public onGetColumnDefinitions(colDefs: ColDef[]): ColDef[] {
        for (const colDef of colDefs) {
            if (colDef.field && LOOKUP_MANY_COLUMNS.has(colDef.field)) {
                colDef.cellRenderer = MemoryLookupManyCellRenderer;
                colDef.autoHeight = true;
                colDef.editable = false;
                colDef.suppressKeyboardEvent = () => true;
            }
        }
        return colDefs;
    }
}
