import * as ReactDOM from "react-dom";
import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as React from "react";
import { ITaskGridDescriptor, TaskGrid as TaskGridComponent } from "@talxis/base-controls";
import { MemoryDescriptor } from "./memory-task-grid/MemoryDescriptor";
import { initializeIcons, mergeStyles } from "@fluentui/react";

/**
 * Alternative PCF entry-point that uses an entirely in-memory data strategy.
 * Useful for local development and visual testing without a live Dataverse environment.
 *
 * To activate, update ControlManifest.Input.xml to reference this class instead of TaskGrid,
 * or register a separate PCF manifest pointing here.
 */
export class TaskGrid implements ComponentFramework.StandardControl<IInputs, IOutputs> {
    private _container: HTMLDivElement;
    private _descriptor: ITaskGridDescriptor;
    private _context: ComponentFramework.Context<IInputs, IOutputs>;

    public init(
        context: ComponentFramework.Context<IInputs, IOutputs>,
        _notifyOutputChanged: () => void,
        _state: ComponentFramework.Dictionary,
        container: HTMLDivElement,
    ): void {
        initializeIcons();
        container.classList.add(mergeStyles({textAlign: 'left'}))
        //needs to be mocked for local host
        window.Xrm = {
            Utility: {
                getGlobalContext: () => ({
                    userSettings: {
                        languageId: 1033,
                        //@ts-ignore
                        formatInfoCultureName: 'en-US'
                    }
                }),
                executeFunction: () => { }
            }
        };
        this._container = container;
        this._context = context;
        this._descriptor = new MemoryDescriptor();
    }

    public updateView(context: ComponentFramework.Context<IInputs, IOutputs>): void {
        this._context = context;
        ReactDOM.render(
            React.createElement(TaskGridComponent, {
                pcfContext: this._context,
                taskGridDescriptor: this._descriptor,
            }),
            this._container,
        );
    }

    public getOutputs(): IOutputs {
        return {};
    }

    public destroy(): void {
        ReactDOM.unmountComponentAtNode(this._container);
    }
}
