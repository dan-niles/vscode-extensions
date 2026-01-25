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

import React from "react";
import styled from "@emotion/styled";
import { Button, Icon, ThemeColors } from "@wso2/ui-toolkit";

interface EnhancementBannerProps {
    onBackToEdit: () => void;
    onReject: () => void;
    onAccept: () => void;
}

const BannerContainer = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 12px 12px;
    background-color: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    gap: 12px;
    z-index: 1800;
    border-radius: 0 0 4px 4px;
`;

const ButtonGroup = styled.div`
    display: flex;
    gap: 8px;
`;

const BannerButton = styled(Button)`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;

    vscode-button {
        border-radius: 3px;
    }
`;

const ButtonIcon = styled(Icon)`
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    width: 16px;
    height: 16px;
    margin-right: 4px;

    i {
        display: flex;
    }
`;

export const EnhancementBanner: React.FC<EnhancementBannerProps> = ({
    onBackToEdit,
    onReject,
    onAccept
}) => {
    const handleReject = () => {
        onReject();
    };

    return (
        <BannerContainer>
            <ButtonGroup>
                <BannerButton
                    appearance="secondary"
                    onClick={onBackToEdit}
                    buttonSx={{ backgroundColor: "var(--vscode-editor-background)" }}
                >
                    <ButtonIcon name="bi-retry" />
                    Try Again
                </BannerButton>
                <BannerButton
                    appearance="secondary"
                    onClick={handleReject}
                    buttonSx={{ backgroundColor: "var(--vscode-editor-background)" }}
                >
                    <ButtonIcon name="bi-close" />
                    Reject
                </BannerButton>
                <BannerButton
                    appearance="primary"
                    onClick={onAccept}
                >
                    <ButtonIcon name="bi-check" />
                    Accept
                </BannerButton>
            </ButtonGroup>
        </BannerContainer>
    );
};
