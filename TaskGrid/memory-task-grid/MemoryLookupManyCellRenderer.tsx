import { MemoryDataProvider } from "@talxis/client-libraries";
import * as React from "react";
import { ICellProps } from "@talxis/base-controls/dist/components/Grid/cells/cell/Cell";
import { LookupManyCellRenderer } from "@talxis/base-controls/dist/components/TaskGrid/components/grid/cell-renderers/lookup-many/LookupManyCellRenderer";
import {
    PEOPLE, PEOPLE_COLUMNS, PEOPLE_METADATA,
    TAGS, TAGS_COLUMNS, TAGS_METADATA,
} from "./MemoryLookupManyData";
import { ThemeProvider } from "@fluentui/react";

const ASSIGNED_TO_COL = 'assignedto';

export const MemoryLookupManyCellRenderer = (props: ICellProps) => {
    const columnName = props.baseColumn.name;

    const dataProvider = React.useMemo(() => {
        if (columnName === ASSIGNED_TO_COL) {
            const p = new MemoryDataProvider({ dataSource: PEOPLE, metadata: PEOPLE_METADATA });
            p.setColumns(PEOPLE_COLUMNS);
            return p;
        }
        const p = new MemoryDataProvider({ dataSource: TAGS, metadata: TAGS_METADATA });
        p.setColumns(TAGS_COLUMNS);
        return p;
    }, []);
    return <ThemeProvider>
        <LookupManyCellRenderer
         {...props} 
         dataProvider={dataProvider} />
    </ThemeProvider>
};
