/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import React, { useState, useEffect } from "react";
import styled from "@emotion/styled";
import { keyframes } from "@emotion/react";
import { TextArea, Button, Typography, ThemeColors, Icon } from "@wso2/ui-toolkit";
import { PromptMode } from "@wso2/ballerina-core";

interface EnhanceModeDialogProps {
    isOpen: boolean;
    isLoading?: boolean;
    onEnhance: (mode: PromptMode, instructions?: string) => void;
    onClose: () => void;
}

const fadeIn = keyframes`
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
`;

const slideUp = keyframes`
    from {
        opacity: 0;
        transform: translateY(15px) scale(0.98);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
`;

const PopupContainer = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 30000;
    display: flex;
    justify-content: center;
    align-items: center;
    pointer-events: none;
`;

const Overlay = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: color-mix(in srgb, ${ThemeColors.SECONDARY_CONTAINER} 80%, transparent);
    z-index: 29999;
    animation: ${fadeIn} 0.2s ease-out forwards;
    will-change: opacity;
`;

const PopupBox = styled.div`
    width: 600px;
    max-width: 90vw;
    max-height: 90vh;
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 3px;
    background-color: var(--vscode-editor-background);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
    z-index: 30001;
    font-family: var(--font-family);
    pointer-events: auto;
    animation: ${slideUp} 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    will-change: transform, opacity;
`;

const PopupHeader = styled.header`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 24px;
    background-color: var(--vscode-editor-background);
    border-bottom: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    font-family: GilmerRegular;
`;

const PopupContent = styled.div`
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 24px;
    overflow-y: auto;
    flex: 1;
`;

const SectionTitle = styled.div`
    font-size: 13px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    margin-bottom: 8px;
`;

const ModeGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
`;

const ModeCard = styled.div<{ isSelected: boolean }>`
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 16px;
    border: 1px solid ${(props) => (props.isSelected ? ThemeColors.PRIMARY : ThemeColors.OUTLINE)};
    background-color: ${(props) => (props.isSelected ? `color-mix(in srgb, var(--vscode-button-background) 5%, transparent)` : 'transparent')};
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
        background-color: var(--vscode-list-hoverBackground);
    }
`;

const ModeHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;

    i {
        font-size: 16px;
        color: ${ThemeColors.PRIMARY};
    }
`;

const ModeTitle = styled.span`
    font-size: 13px;
    font-weight: 600;
    color: ${ThemeColors.ON_SURFACE};
`;

const ModeDesc = styled.span`
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const ModeIcon = styled(Icon)`
    font-size: 16px;
    width: 16px;
    height: 16px;
    color: ${ThemeColors.PRIMARY};
`;

const DialogActions = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    padding: 16px 24px;
    background-color: var(--vscode-editor-background);
    border-top: 1px solid ${ThemeColors.OUTLINE_VARIANT};
`;

const DisclaimerText = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
`;

const MODES = [
    {
        id: PromptMode.REFINE,
        icon: "bi-ai-model",
        title: "Refine",
        desc: "Improve clarity, grammar, and structure. Best for general use."
    },
    {
        id: PromptMode.COMPRESS,
        icon: "bi-collapse-item",
        title: "Shorten",
        desc: "Remove fluff and enforce strict rules. Best for token efficiency."
    }
];

export const EnhanceModeDialog: React.FC<EnhanceModeDialogProps> = ({
    isOpen,
    isLoading = false,
    onEnhance,
    onClose
}) => {
    const [instructions, setInstructions] = useState("");
    const [selectedMode, setSelectedMode] = useState<PromptMode>(PromptMode.REFINE);

    // Reset state when dialog opens
    useEffect(() => {
        if (isOpen) {
            setInstructions("");
            setSelectedMode(PromptMode.REFINE);
        }
    }, [isOpen]);

    const handleEnhanceTrigger = () => {
        onEnhance(selectedMode, instructions.trim() || undefined);
    };

    const handleClose = () => {
        if (!isLoading) {
            setInstructions("");
            onClose();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Escape" && !isLoading) {
            e.preventDefault();
            handleClose();
        } else if (e.key === "Enter" && e.ctrlKey && !isLoading) {
            e.preventDefault();
            handleEnhanceTrigger();
        }
    };

    if (!isOpen) return null;

    return (
        <>
            <Overlay onClick={handleClose} />
            <PopupContainer>
                <PopupBox onKeyDown={handleKeyDown} tabIndex={-1} autoFocus>
                    <PopupHeader>
                        <Typography variant="h3" sx={{ margin: 0 }}>
                            Enhance Prompt with AI
                        </Typography>
                        <Icon
                            name="bi-close"
                            onClick={handleClose}
                            sx={{
                                cursor: isLoading ? 'not-allowed' : 'pointer',
                                fontSize: '16px',
                                width: '16px',
                                height: '16px',
                                color: ThemeColors.ON_SURFACE_VARIANT,
                                opacity: isLoading ? 0.5 : 1
                            }}
                        />
                    </PopupHeader>

                    <PopupContent>
                        <div>
                            <SectionTitle>Select Enhancement Goal:</SectionTitle>
                            <ModeGrid>
                                {MODES.map((mode) => (
                                    <ModeCard
                                        key={mode.id}
                                        isSelected={selectedMode === mode.id}
                                        onClick={() => !isLoading && setSelectedMode(mode.id)}
                                    >
                                        <ModeHeader>
                                            <ModeIcon name={mode.icon} />
                                            <ModeTitle>{mode.title}</ModeTitle>
                                        </ModeHeader>
                                        <ModeDesc>{mode.desc}</ModeDesc>
                                    </ModeCard>
                                ))}
                            </ModeGrid>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <SectionTitle>
                                <span style={{ fontWeight: 600 }}>Additional Instructions</span> (Optional)
                            </SectionTitle>
                            <TextArea
                                placeholder="e.g. 'The agent isn't using tools properly' or 'Make the output more concise.'"
                                value={instructions}
                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInstructions(e.target.value)}
                                rows={5}
                                disabled={isLoading}
                                style={{ fontSize: '13px', fontFamily: 'inherit', width: '100%' }}
                            />
                        </div>

                        <DisclaimerText>
                            <span>Note: AI-generated enhancements may contain errors or unexpected changes. Please review the enhanced prompt carefully before accepting.</span>
                        </DisclaimerText>
                    </PopupContent>

                    <DialogActions>
                        <Button appearance="secondary" onClick={handleClose} disabled={isLoading}>
                            Cancel
                        </Button>
                        <Button appearance="primary" onClick={handleEnhanceTrigger} disabled={isLoading}>
                            {isLoading ? (
                                <>
                                    <span style={{ marginLeft: '8px' }}>Optimizing...</span>
                                </>
                            ) : (
                                "Enhance"
                            )}
                        </Button>
                    </DialogActions>
                </PopupBox>
            </PopupContainer>
        </>
    );
};
