/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { commands, debug, DebugSession, tasks, Terminal, Uri, window } from "vscode";
import { extension } from "../../BalExtensionContext";
import { startDebugging } from "../editor-support/activator";
import { TracerMachine } from "../tracing";
import { PALETTE_COMMANDS } from "./cmds/cmd-runner";

const TRACE_SERVER_TASK_SOURCE = "ballerina-tracing";
const TRACE_SERVER_TASK_NAME = "Start Trace Server";

const BALLERINA_DEBUG_SESSION_NAME = "Ballerina Debug";

let runTerminal: Terminal | undefined;
let runDebugSession: DebugSession | undefined;
let lastRunPath: string | undefined;

export function markTerminalRunStarted(terminal: Terminal, path: string): void {
    runTerminal = terminal;
    lastRunPath = path;
}

export function isIntegrationRunning(): boolean {
    const terminalAlive = !!runTerminal && runTerminal.exitStatus === undefined;
    const debugAlive = !!runDebugSession;
    return terminalAlive || debugAlive;
}

export async function restartIntegration(): Promise<void> {
    if (runDebugSession) {
        const script = (runDebugSession.configuration as { script?: string })?.script
            ?? lastRunPath;
        await debug.stopDebugging(runDebugSession);
        runDebugSession = undefined;
        await terminateTraceServerTask();
        TracerMachine.startServer();
        if (script) {
            // Re-launch directly so we skip the BI run flow's Try-It suggestion.
            await startDebugging(Uri.file(script), false, false, true);
        } else {
            window.showErrorMessage(
                "Could not restart the integration automatically — please run it again manually."
            );
        }
        return;
    }
    if (runTerminal) {
        runTerminal.dispose();
        runTerminal = undefined;
    }
    await terminateTraceServerTask();
    TracerMachine.startServer();
    const runArg = lastRunPath ? Uri.file(lastRunPath) : undefined;
    await commands.executeCommand(PALETTE_COMMANDS.RUN, runArg);
}

async function terminateTraceServerTask(): Promise<void> {
    const traceTask = tasks.taskExecutions.find(
        (execution) => execution.task.source === TRACE_SERVER_TASK_SOURCE
            && execution.task.name === TRACE_SERVER_TASK_NAME
    );
    if (!traceTask) {
        return;
    }
    await new Promise<void>((resolve) => {
        const subscription = tasks.onDidEndTask((event) => {
            if (event.execution === traceTask) {
                subscription.dispose();
                resolve();
            }
        });
        traceTask.terminate();
    });
}

export function activateIntegrationRunnerState(): void {
    extension.context.subscriptions.push(
        window.onDidCloseTerminal((terminal) => {
            if (terminal === runTerminal) {
                runTerminal = undefined;
            }
        }),
        debug.onDidStartDebugSession((session) => {
            if (session.name === BALLERINA_DEBUG_SESSION_NAME) {
                runDebugSession = session;
                const script = (session.configuration as { script?: string })?.script;
                if (script) {
                    lastRunPath = script;
                }
            }
        }),
        debug.onDidTerminateDebugSession((session) => {
            if (session === runDebugSession) {
                runDebugSession = undefined;
            }
        })
    );
}
