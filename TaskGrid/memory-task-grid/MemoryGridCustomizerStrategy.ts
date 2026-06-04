import { IGridCustomizer, IGridCustomizerStrategy, ColDef } from "@talxis/base-controls/dist/components/TaskGrid/components/grid/grid-customizer/GridCustomizer";
import { MemoryLookupManyCellRenderer } from "./MemoryLookupManyCellRenderer";

const LOOKUP_MANY_COLUMNS = new Set(['assignedto', 'tags']);

export class MemoryGridCustomizerStrategy implements IGridCustomizerStrategy {
    public onInitialize(_customizer: IGridCustomizer): void {}

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
