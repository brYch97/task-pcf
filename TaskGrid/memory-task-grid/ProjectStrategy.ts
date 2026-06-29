import { IFieldMapping } from "@talxis/base-controls";
import { IProjectStrategy } from "@talxis/base-controls/dist/components/TaskGrid/extensions/providers/project";
import { IRecord } from "@talxis/client-libraries";

export class ProjectStrategy implements IProjectStrategy {
    private _fieldMapping: IFieldMapping;

    constructor(fieldMapping: IFieldMapping) {
        this._fieldMapping = fieldMapping;
    }

    public async onLoad() {
        return {
            endDate: new Date('2024-12-31'),
            startDate: new Date('2024-01-01'),
            entityReference: {
                id: {
                    guid: 'Sample Project',
                },
                name: 'Sample Project',
                entityType: 'project',
            },
        }
    }

    public async onGetLatestDates(tasks: IRecord[]) {
        let { startDate, endDate } = this.getStartEndDateFromRecords(tasks);
        return {
            endDate: endDate,
            startDate: startDate
        }
    }

    public getStartEndDateFromRecords(records: IRecord[]): { startDate: Date | null, endDate: Date | null } {
        const startDateColumnName = this.getStartDateColumnName();
        const endDateColumnName = this.getEndDateColumnName();
        let minDate: Date | null = null;
        let maxDate: Date | null = null;

        for (const record of records) {
            const startDate = this.getDateFromString(record.getValue(startDateColumnName));
            const endDate = this.getDateFromString(record.getValue(endDateColumnName));

            if (startDate && (!minDate || startDate.getTime() < minDate.getTime())) {
                minDate = startDate;
            }

            if (endDate && (!maxDate || endDate.getTime() > maxDate.getTime())) {
                maxDate = endDate;
            }
        }
        return {
            startDate: minDate,
            endDate: maxDate
        }
    }
    public getDateFromString(date: string | null): Date | null {
        if (!date) return null;
        return new Date(date);
    }

    public getStartDateColumnName(): string {
        const colName = this._fieldMapping.startDate;
        if (!colName) {
            throw new Error('Start date column is not defined in field mapping!');
        }
        return colName;
    }

    public getEndDateColumnName(): string {
        const colName = this._fieldMapping.endDate;
        if (!colName) {
            throw new Error('End date column is not defined in field mapping!');
        }
        return colName;
    }



}