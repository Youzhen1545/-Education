class CaseSimulator {
    constructor() {
        this.currentNode = 'intro';
        this.currentNodeRounds = 0;
        this.userMessages = [];
        this.decisions = [];
        this.ethicsScore = 0;
        this.completedNodes = 0;
        this.isProcessing = false;
        this.isTyping = false;
        this.api = api;
        this.userInfo = null;
        this.nodeResults = [];
        this.overallAssessment = null;
        
        this.nodeDataForUpload = {
            build_rel: '',
            n1: '', n2: '', n3: '', n4: '', n5: ''
        };
        
        this.redLineViolated = false;
        this.redLineViolationDetails = null;
        this.ethicalDecisionsCount = 0;
        
        this.nodeDialoguePool = '';
        this.currentNodeStartTime = null;
        
        this.init();
    }

    init() {
        console.log('🚀 CaseSimulator 初始化开始...');
        
        if (typeof CASE_NODES === 'undefined' || !CASE_NODES || typeof CASE_NODES !== 'object') {
            console.error('❌ 数据源 CASE_NODES 未定义或格式错误！');
            this.showInitError('数据加载失败：案例节点数据未找到。请确保 nodes.js 文件已正确加载。<br><br>建议操作：<br>1. 刷新页面（Ctrl+F5）<br>2. 检查浏览器控制台是否有文件加载错误<br>3. 确认 nodes.js 文件存在于项目目录');
            return;
        }

        const nodeIds = Object.keys(CASE_NODES);
        console.log(`✅ CASE_NODES 加载成功，共 ${nodeIds.length} 个节点:`, nodeIds.join(', '));

        if (!CASE_NODES['intro']) {
            console.error("❌ 找不到起始节点 'intro'");
            this.showInitError('数据结构错误：缺少必要的起始节点（intro）。<br><br>请检查 nodes.js 文件是否完整。');
            return;
        }
        
        this.bindEvents();
        this.updateUI();
        this.initMobileSidebar();
        this.initInfoForm();
        
        this.checkForSavedProgress();
        
        console.log('✅ CaseSimulator 初始化完成');
    }

    showInitError(message) {
        const scenarioBox = document.getElementById('scenario-box');
        if (scenarioBox) {
            scenarioBox.innerHTML = `<div class="init-error" style="color: #dc2626; padding: 20px; background: #fef2f2; border: 2px solid #fecaca; border-radius: 8px; margin: 20px;">
                <h3 style="color: #dc2626; margin-bottom: 10px;">⚠️ 系统初始化错误</h3>
                <p style="line-height: 1.6;">${message}</p>
            </div>`;
        }
        
        const startBtn = document.getElementById('start-btn');
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.innerHTML = '❌ 系统异常';
            startBtn.style.opacity = '0.5';
        }
    }

    checkForSavedProgress() {
        try {
            const saved = localStorage.getItem('sw_sim_backup');
            if (saved) {
                const data = JSON.parse(saved);
                const saveTime = new Date(data.timestamp);
                const timeDiff = (Date.now() - saveTime.getTime()) / 1000 / 60;
                
                console.log(`📦 发现已保存的进度 (${timeDiff.toFixed(1)} 分钟前):`, {
                    currentNode: data.currentNode,
                    messagesCount: data.userMessages?.length || 0,
                    completedNodes: data.completedNodes || 0
                });
                
                if (timeDiff < 1440 && data.currentNode && data.currentNode !== 'intro' && (data.userMessages?.length > 0 || data.completedNodes > 0)) {
                    const timeStr = this.formatSaveTime(saveTime);
                    
                    setTimeout(() => {
                        if (confirm(`💾 检测到未完成的模拟记录\n\n保存时间：${timeStr}\n当前进度：${data.nodeName || data.currentNode}\n已完成节点：${data.completedNodes || 0}/5\n\n是否继续上次的进度？\n\n（点击"取消"将开始新模拟）`)) {
                            this.resumeFromBackup(data);
                        } else {
                            console.log('🗑️ 用户选择开始新模拟，清除旧备份');
                            this.clearSavedProgress();
                        }
                    }, 500);
                } else if (timeDiff >= 1440) {
                    console.log('⏰ 备份数据超过24小时，自动清除');
                    this.clearSavedProgress();
                }
            }
        } catch (e) {
            console.warn('⚠️ 检查保存进度时出错:', e);
        }
    }

    saveProgress(reason = 'auto') {
        try {
            if (!this.currentNode || this.currentNode === 'intro') {
                return;
            }

            const backup = {
                version: '202604191730',
                timestamp: new Date().toISOString(),
                currentNode: this.currentNode,
                nodeName: CASE_NODES[this.currentNode]?.name || '',
                currentNodeRounds: this.currentNodeRounds,
                userMessages: this.userMessages.slice(-50),
                decisions: this.decisions,
                nodeResults: this.nodeResults,
                completedNodes: this.completedNodes,
                ethicsScore: this.ethicsScore,
                userInfo: this.userInfo,
                overallAssessment: this.overallAssessment
            };

            const backupStr = JSON.stringify(backup);
            
            if (backupStr.length > 4 * 1024 * 1024) {
                console.warn('⚠️ 备份数据过大 (>4MB)，跳过保存');
                return;
            }

            localStorage.setItem('sw_sim_backup', backupStr);
            
            console.log(`💾 进度已保存 [${reason}]:`, {
                currentNode: backup.currentNode,
                messagesCount: backup.userMessages.length,
                size: `${(backupStr.length / 1024).toFixed(1)}KB`
            });
        } catch (e) {
            console.error('❌ 保存进度失败:', e);
        }
    }

    resumeFromBackup(data) {
        console.log('🔄 从备份恢复进度...');

        try {
            this.currentNode = data.currentNode || 'intro';
            this.currentNodeRounds = data.currentNodeRounds || 0;
            this.userMessages = Array.isArray(data.userMessages) ? data.userMessages : [];
            this.decisions = Array.isArray(data.decisions) ? data.decisions : [];
            this.nodeResults = Array.isArray(data.nodeResults) ? data.nodeResults : [];
            this.completedNodes = data.completedNodes || 0;
            this.ethicsScore = data.ethicsScore || 0;
            this.userInfo = data.userInfo || null;
            this.overallAssessment = data.overallAssessment || null;

            const simulationPage = document.getElementById('simulation-page');
            if (!simulationPage) {
                throw new Error('模拟页面元素未找到，DOM可能未完全加载');
            }

            this.showPage('simulation-page');

            const nodeData = CASE_NODES[this.currentNode];
            if (nodeData) {
                this.updateScenarioDisplay(nodeData);
                this.updateProgressInfo(nodeData);
                this.updateDecisionStats();
                this.updateNodeIndicator(nodeData.name);

                const chatMessages = document.getElementById('chat-messages');
                if (chatMessages && this.userMessages.length > 0) {
                    chatMessages.innerHTML = '';
                    this.userMessages.forEach(msg => {
                        try {
                            this.addMessageToDOM(msg);
                        } catch (msgError) {
                            console.warn('⚠️ 恢复消息失败:', msgError);
                        }
                    });
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }

                this.enableInput();

                alert(`✅ 进度恢复成功！\n\n当前位置：${nodeData.name}\n已完成：${this.completedNodes}/5 个节点\n\n您可以继续对话或点击"结束模拟"查看评估。`);
            } else {
                throw new Error('备份数据中的节点不存在');
            }
        } catch (e) {
            console.error('❌ 恢复进度失败:', e);
            alert('恢复失败，将开始新模拟。错误：' + e.message);
            this.clearSavedProgress();
            this.restart();
        }
    }

    clearSavedProgress() {
        try {
            localStorage.removeItem('sw_sim_backup');
            console.log('🗑️ 已清除保存的进度');
        } catch (e) {
            console.warn('⚠️ 清除进度失败:', e);
        }
    }

    formatSaveTime(isoString) {
        if (!isoString) return '-';
        const date = new Date(isoString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        
        let timeAgo = '';
        if (diffMins < 1) {
            timeAgo = '刚刚';
        } else if (diffMins < 60) {
            timeAgo = `${diffMins} 分钟前`;
        } else {
            const diffHours = Math.floor(diffMins / 60);
            if (diffHours < 24) {
                timeAgo = `${diffHours} 小时前`;
            } else {
                const diffDays = Math.floor(diffHours / 24);
                timeAgo = `${diffDays} 天前`;
            }
        }
        
        return date.toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }) + ` (${timeAgo})`;
    }

    bindEvents() {
        document.getElementById('start-btn').addEventListener('click', () => {
            this.startSimulation();
        });

        document.getElementById('send-btn').addEventListener('click', () => {
            this.handleUserInput();
        });

        document.getElementById('user-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleUserInput();
            }
        });

        document.getElementById('restart-btn').addEventListener('click', () => {
            this.restart();
        });
    }

    initInfoForm() {
        const form = document.getElementById('info-form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleInfoSubmit();
            });
        }
        
        const studentTypeSelect = document.getElementById('student-type');
        if (studentTypeSelect) {
            studentTypeSelect.addEventListener('change', (e) => {
                this.updateGradeOptions(e.target.value);
            });
        }
    }

    updateGradeOptions(studentType) {
        const gradeSelect = document.getElementById('grade');
        if (!gradeSelect) return;
        
        const gradeOptions = {
            '本科': [
                { value: '大一', text: '大一' },
                { value: '大二', text: '大二' },
                { value: '大三', text: '大三' },
                { value: '大四', text: '大四' }
            ],
            '研究生': [
                { value: '研一', text: '研一' },
                { value: '研二', text: '研二' },
                { value: '研三及以上', text: '研三及以上' }
            ],
            '在职': [
                { value: '在职1年以下', text: '在职1年以下' },
                { value: '在职1-3年', text: '在职1-3年' },
                { value: '在职3-5年', text: '在职3-5年' },
                { value: '在职5年以上', text: '在职5年以上' }
            ],
            '其他': [
                { value: '其他', text: '其他' }
            ]
        };

        gradeSelect.innerHTML = '<option value="">请选择</option>';
        
        const options = gradeOptions[studentType] || [];
        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.text;
            gradeSelect.appendChild(option);
        });
    }

    handleInfoSubmit() {
        console.log('📝 handleInfoSubmit() 开始执行');
        
        const name = document.getElementById('name').value.trim();
        const gender = document.getElementById('gender').value;
        const major = document.getElementById('major').value.trim();
        const studentType = document.getElementById('student-type').value;
        const grade = document.getElementById('grade').value;
        const school = document.getElementById('school').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const email = document.getElementById('email').value.trim();

        console.log('📋 获取到的表单数据:', { name, gender, major, studentType, grade, school });

        if (!name || !gender || !major || !studentType || !grade || !school) {
            console.warn('⚠️ 表单验证失败：缺少必填项');
            alert('请填写所有必填项（带 * 号的字段）:\n\n' +
                  (!name ? '❌ 姓名\n' : '') +
                  (!gender ? '❌ 性别\n' : '') +
                  (!major ? '❌ 专业\n' : '') +
                  (!studentType ? '❌ 学生类型\n' : '') +
                  (!grade ? '❌ 年级\n' : '') +
                  (!school ? '❌ 学校/单位\n' : ''));
            return false;
        }

        this.userInfo = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            name,
            gender,
            major,
            studentType,
            grade,
            school,
            phone,
            email,
            submitTime: new Date().toISOString(),
            status: 'in-progress',
            ethicsScore: 0,
            completedNodes: 0,
            decisions: [],
            messages: []
        };

        console.log('💾 用户信息对象已创建:', this.userInfo);

        localStorage.setItem('currentUserInfo', JSON.stringify(this.userInfo));
        this.saveUserInfo();
        
        console.log(`✅ 用户信息已保存: ${name} (${studentType} - ${grade})`);
        console.log('🔄 准备跳转到首页...');
        
        showPage('home-page');
        console.log('✅ 页面跳转完成');
        
        return true;
    }

    handleInfoFormSubmit() {
        console.log('🔘 handleInfoFormSubmit() 被调用');
        console.log('📍 this对象:', this);
        console.log('📍 simulator全局变量:', window.simulator);
        
        try {
            const result = this.handleInfoSubmit();
            console.log('✅ handleInfoSubmit() 返回:', result);
            return result;
        } catch (error) {
            console.error('❌ handleInfoFormSubmit() 执行出错:', error);
            alert('提交失败：' + error.message + '\n\n请按F12查看控制台获取详细错误信息。');
            return false;
        }
    }

    saveUserInfo() {
        if (!this.userInfo) return;
        
        let users = JSON.parse(localStorage.getItem('simulatorUsers') || '[]');
        const existingIndex = users.findIndex(u => u.id === this.userInfo.id);
        
        this.userInfo.status = this.completedNodes >= 5 ? 'completed' : 'in-progress';
        this.userInfo.ethicsScore = this.ethicsScore;
        this.userInfo.completedNodes = this.completedNodes;
        this.userInfo.decisions = this.decisions;
        this.userInfo.messages = this.userMessages;
        this.userInfo.endTime = new Date().toISOString();

        if (existingIndex >= 0) {
            users[existingIndex] = this.userInfo;
        } else {
            users.push(this.userInfo);
        }

        localStorage.setItem('simulatorUsers', JSON.stringify(users));
    }

    startSimulation() {
        this.showPage('simulation-page');
        this.loadNode('intro');
    }

    showPage(pageId) {
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });
        document.getElementById(pageId).classList.add('active');
    }

    async loadNode(nodeId) {
        this.currentNode = nodeId;
        this.currentNodeRounds = 0;
        const nodeData = CASE_NODES[nodeId];
        
        if (!nodeData) {
            console.error('节点不存在:', nodeId);
            return;
        }

        this.updateScenarioDisplay(nodeData);
        this.updateNodeIndicator(nodeData.name);
        this.updateProgressInfo(nodeData);
        
        if (nodeId === 'intro') {
            await this.showIntroScenario();
        } else if (!nodeData.isEnding) {
            await this.showNodeScenario(nodeData);
        }

        if (nodeData.isEnding) {
            await this.handleEnding(nodeData);
        }
    }

    async showIntroScenario() {
        const nodeData = CASE_NODES['intro'];
        
        await this.typeMessageWithPreload({
            type: 'system',
            sender: '环境',
            content: nodeData.scenario,
            timestamp: new Date()
        }, null);

        try {
            await this.addTypingIndicator();
            
            const firstResponse = await this.api.generateFirstResponse('intro', {});
            
            this.removeTypingIndicator();
            
            await this.typeMessageWithPreload({
                type: 'npc',
                sender: '刘雪梅',
                content: firstResponse,
                timestamp: new Date()
            }, null);

            this.enableInput();
        } catch (error) {
            this.removeTypingIndicator();
            await this.addMessage({
                type: 'system',
                sender: '系统',
                content: '角色加载失败，请刷新页面重试',
                timestamp: new Date()
            });
            this.enableInput();
        }
    }

    async showNodeScenario(nodeData) {
        await this.typeMessageWithPreload({
            type: 'system',
            sender: '环境',
            content: nodeData.scenario,
            timestamp: new Date()
        }, null);

        const primaryCharacter = nodeData.characters && Array.isArray(nodeData.characters) ? nodeData.characters.find(c => c !== 'system') : null;
        if (primaryCharacter && CHARACTER_PROFILES[primaryCharacter]) {
            const characterName = CHARACTER_PROFILES[primaryCharacter].name;
            
            try {
                await this.addTypingIndicator();
                
                const firstResponse = await this.api.generateFirstResponse(
                    this.currentNode,
                    { userMessages: this.userMessages, decisions: this.decisions }
                );
                
                this.removeTypingIndicator();
                
                await this.typeMessageWithPreload({
                    type: 'npc',
                    sender: characterName,
                    content: firstResponse,
                    timestamp: new Date()
                }, null);
            } catch (error) {
                this.removeTypingIndicator();
                await this.addMessage({
                    type: 'system',
                    sender: '系统',
                    content: `⚠️ ${characterName}加载失败，请重试`,
                    timestamp: new Date()
                });
            }
        }

        this.enableInput();
    }

    async handleUserInput() {
        const input = document.getElementById('user-input');
        const message = input.value.trim();

        if (!message) return;

        if (this.isTyping) {
            this.skipTyping();
            await this.delay(50);
        }

        if (this.isProcessing) {
            return;
        }

        this.isProcessing = true;
        this.disableInput();

        await this.addMessage({
            type: 'user',
            sender: '社工小李',
            content: message,
            timestamp: new Date()
        });

        this.userMessages.push({
            nodeId: this.currentNode,
            round: this.currentNodeRounds + 1,
            content: message,
            timestamp: new Date()
        });

        input.value = '';

        await this.processUserResponse(message);
    }

    async processUserResponse(message) {
        const nodeData = CASE_NODES[this.currentNode];
        this.currentNodeRounds++;
        
        if (!this.currentNodeStartTime) {
            this.currentNodeStartTime = new Date();
            console.log(`📝 开始记录节点 ${this.currentNode} 的对话`);
        }
        
        this.addToDialoguePool('用户（社工小李）', message);
        
        const redLineCheck = this.checkRedLineViolation(message);
        
        if (redLineCheck.isViolation) {
            console.error('🚨🚨🚨 红线违规！一票否决触发 🚨🚨🚨');
            console.error('   违规类别:', redLineCheck.category);
            console.error('   违规详情:', redLineCheck.description);
            
            this.redLineViolated = true;
            this.redLineViolationDetails = redLineCheck;
            this.ethicsScore = 0;
            
            this.userMessages.push({
                type: 'user',
                content: message,
                timestamp: new Date(),
                isRedLineViolation: true
            });
            
            await this.addTypingIndicator();
            
            const warningMessage = {
                type: 'system',
                sender: '系统警告',
                content: `⛔ <strong>【红线违规警告】</strong><br><br>
                         <span style="color: #dc2626; font-weight: bold;">${redLineCheck.category}</span><br>
                         ${redLineCheck.description}<br><br>
                         ⚠️ 根据伦理评估规则，您的行为已触碰红线。<br>
                         <strong>本次模拟总成绩将被清零。</strong><br><br>
                         系统将记录此违规行为，您可以继续完成模拟以查看详细反馈。`,
                timestamp: new Date(),
                isWarning: true
            };
            
            this.removeTypingIndicator();
            await this.addMessage(warningMessage);
            
            setTimeout(() => {
                if (confirm('您已触发红线违规，当前成绩已清零。\n\n是否继续完成模拟？\n\n（选择"确定"继续，选择"取消"结束模拟）')) {
                    this.saveProgress('红线违规后继续');
                } else {
                    this.endSimulationDueToRedLine();
                }
            }, 500);
            
            return;
        }
        
        await this.addTypingIndicator();
        
        try {
            const result = await this.api.generateNPCResponseWithTransition(
                this.currentNode,
                message,
                this.currentNodeRounds,
                nodeData.minRounds || 2,
                nodeData.maxRounds || 4,
                {
                    userMessages: this.userMessages,
                    decisions: this.decisions,
                    currentNodeRounds: this.currentNodeRounds,
                    currentUserTendency: this.getLastTendency(this.currentNode)
                }
            );

            this.removeTypingIndicator();

            const maxRounds = nodeData.maxRounds || 4;
            const minRounds = nodeData.minRounds || 2;
            const forceTransition = this.currentNodeRounds >= maxRounds;
            
            let shouldTransition = false;

            const isCriticalQuestion = this.detectCriticalEthicalQuestion(message);
            
            if (isCriticalQuestion) {
                shouldTransition = false;
                console.log('🚨 检测到关键伦理问题，暂停过渡:', message.substring(0, 50));
            } else if (forceTransition) {
                shouldTransition = true;
            } else if (result.shouldTransition && this.currentNodeRounds >= minRounds && nodeData.nextNode && !nodeData.isEnding) {
                shouldTransition = true;
            }

            const isMultiCharacterMeeting = nodeData.characters && 
                                           nodeData.characters.length > 3 && 
                                           nodeData.characters.includes('xiaoming');
            
            let messagesToShow = [];
            
            if (isMultiCharacterMeeting) {
                messagesToShow = this.splitMultiCharacterMessage(result.response, nodeData);
            } else {
                messagesToShow = [{
                    type: 'npc',
                    sender: this.getNPCName(nodeData),
                    content: result.response,
                    timestamp: new Date()
                }];
            }

            if (shouldTransition && nodeData.nextNode && !nodeData.isEnding) {
                for (let i = 0; i < messagesToShow.length; i++) {
                    const msg = messagesToShow[i];
                    if (i === messagesToShow.length - 1) {
                        const preloaded = await this.typeMessageWithPreload(msg, () => {
                            return this.preloadTransitionData(nodeData, nodeData.nextNode, message);
                        });
                        
                        await this.executeTransition(nodeData, nodeData.nextNode, message, preloaded);
                    } else {
                        await this.typeMessageWithPreload(msg, null);
                        await this.delay(300);
                    }
                }
            } else if (nodeData.isEnding && this.currentNodeRounds >= (nodeData.minRounds || 2)) {
                for (let i = 0; i < messagesToShow.length; i++) {
                    const msg = messagesToShow[i];
                    if (i === messagesToShow.length - 1) {
                        const preloaded = await this.typeMessageWithPreload(msg, () => {
                            return this.preloadEndingData(nodeData);
                        });
                        
                        await this.executeEnding(nodeData, preloaded);
                    } else {
                        await this.typeMessageWithPreload(msg, null);
                        await this.delay(300);
                    }
                }
            } else {
                for (const msg of messagesToShow) {
                    await this.typeMessageWithPreload(msg, null);
                    await this.delay(200);
                }
            }

        this.saveProgress('对话完成');
        this.isProcessing = false;
        this.enableInput();
        } catch (error) {
            this.skipTyping();
            this.removeTypingIndicator();
            console.error('处理响应时出错:', error);
            
            const errorMsg = error.code === 'TIMEOUT' ? '⏰ 请求超时，请检查网络后重试' :
                              error.code === 'NETWORK_ERROR' ? '🌐 网络连接失败，请检查网络' :
                              error.code === 'API_ERROR' ? `❌ API错误: ${error.message}` :
                              `⚠️ 出现异常: ${error.message}`;
            
            await this.addMessage({
                type: 'system',
                sender: '系统',
                content: errorMsg + '（对话可继续，部分功能可能受限）',
                timestamp: new Date()
            });

            const currentNodeDataForEnd = CASE_NODES[this.currentNode];
            const isNearEnding = currentNodeDataForEnd && 
                               (currentNodeDataForEnd.isEnding || 
                                this.currentNodeRounds >= (currentNodeDataForEnd.maxRounds || 4) - 1 ||
                                this.completedNodes >= 4);
            
            if (isNearEnding) {
                await this.addMessage({
                    type: 'system',
                    sender: '🎭',
                    content: '\n\n📌 **案例模拟即将结束**\n\n您已完成大部分关键节点的讨论。您可以：\n• 继续输入进行更多对话\n• 点击下方按钮直接查看评估总结',
                    timestamp: new Date()
                });

                const endBtnContainer = document.createElement('div');
                endBtnContainer.className = 'end-simulation-prompt';
                endBtnContainer.innerHTML = `
                    <button id="end-simulation-now-btn" class="primary-btn">
                        🎬 结束模拟 & 查看评估总结 →
                    </button>
                `;
                
                const chatMessages = document.getElementById('chat-messages');
                chatMessages.appendChild(endBtnContainer);
                chatMessages.scrollTop = chatMessages.scrollHeight;

                document.getElementById('end-simulation-now-btn').addEventListener('click', async () => {
                    endBtnContainer.remove();
                    
                    const endingNodeData = CASE_NODES['node7'] || { isEnding: true, endingType: 'best', name: '结局' };
                    await this.handleEnding(endingNodeData);
                });
            }
            
            this.isProcessing = false;
            this.enableInput();
        }
    }

    async smoothTransition(currentNodeData, nextNodeId, lastMessage) {
        await this.addTypingIndicator();

        const transitionText = this.api.getScenarioTransitionDirect(
            this.currentNode, nextNodeId
        );

        this.removeTypingIndicator();
        
        await this.typeMessageWithPreload({
            type: 'system',
            sender: '场景过渡',
            content: transitionText,
            timestamp: new Date()
        }, null);

        const nextNodeData = CASE_NODES[nextNodeId];
        if (!nextNodeData) return;

        await this.typeMessageWithPreload({
            type: 'system',
            sender: '环境',
            content: nextNodeData.scenario,
            timestamp: new Date()
        }, null);

        this.currentNode = nextNodeId;
        this.currentNodeRounds = 0;

        const analysisPromise = this.api.analyzeUserTendency(
            this.getNodeMessages(currentNodeData.id),
            this.currentNode,
            currentNodeData.choices
        ).catch(err => {
            console.warn('后台伦理分析失败:', err);
            return null;
        });

        const primaryCharacter = nextNodeData.characters && Array.isArray(nextNodeData.characters) ? nextNodeData.characters.find(c => c !== 'system') : null;

        if (primaryCharacter && CHARACTER_PROFILES[primaryCharacter]) {
            const characterName = CHARACTER_PROFILES[primaryCharacter].name;
            
            await this.addTypingIndicator();

            try {
                const [firstResponse, analysis] = await Promise.all([
                    this.api.generateFirstResponse(nextNodeId, {
                        userMessages: this.userMessages,
                        decisions: this.decisions
                    }),
                    analysisPromise
                ]);

                this.removeTypingIndicator();

                if (analysis) {
                    this.recordDecision(currentNodeData.id, currentNodeData, lastMessage, analysis);
                }
                
                await this.addMessage({
                    type: 'npc',
                    sender: characterName,
                    content: firstResponse,
                    timestamp: new Date()
                });
            } catch (error) {
                this.removeTypingIndicator();
                
                const analysis = await analysisPromise;
                if (analysis) {
                    this.recordDecision(currentNodeData.id, currentNodeData, lastMessage, analysis);
                }
                
                await this.addMessage({
                    type: 'system',
                    sender: '系统',
                    content: `⚠️ ${characterName}加载失败，请重试`,
                    timestamp: new Date()
                });
            }
        } else {
            const analysis = await analysisPromise;
            if (analysis) {
                this.recordDecision(currentNodeData.id, currentNodeData, lastMessage, analysis);
            }
        }
    }

    async smoothEnding(nodeData) {
        await this.addTypingIndicator();

        const [summary, analysis] = await Promise.all([
            this.api.generateEndingSummary(this.decisions, this.ethicsScore, nodeData.endingType),
            this.api.analyzeUserTendency(
                this.getNodeMessages(this.currentNode),
                this.currentNode,
                nodeData.choices
            ).catch(err => {
                console.warn('结束节点伦理分析失败:', err);
                return null;
            })
        ]);

        this.removeTypingIndicator();

        if (analysis) {
            this.recordDecision(this.currentNode, nodeData, '', analysis);
        }

        this.showEndPage(summary);
    }

    async preloadTransitionData(currentNodeData, nextNodeId, lastMessage) {
        const analysisPromise = this.api.analyzeUserTendency(
            this.getNodeMessages(currentNodeData.id),
            currentNodeData.id,
            currentNodeData.choices
        ).catch(err => {
            console.warn('预加载伦理分析失败:', err);
            return null;
        });

        const nextNodeData = CASE_NODES[nextNodeId];
        let firstResponsePromise = Promise.resolve(null);

        if (nextNodeData && nextNodeData.characters && Array.isArray(nextNodeData.characters)) {
            const primaryCharacter = nextNodeData.characters.find(c => c !== 'system');
            if (primaryCharacter && CHARACTER_PROFILES[primaryCharacter]) {
                firstResponsePromise = this.api.generateFirstResponse(nextNodeId, {
                    userMessages: this.userMessages,
                    decisions: this.decisions
                }).catch(err => {
                    console.warn('预加载下一节点首响失败:', err);
                    return null;
                });
            }
        }

        const [analysis, firstResponse] = await Promise.all([analysisPromise, firstResponsePromise]);

        return { analysis, firstResponse, nextNodeId, nextNodeData };
    }

    async preloadEndingData(nodeData) {
        const [summary, analysis] = await Promise.all([
            this.api.generateEndingSummary(this.decisions, this.ethicsScore, nodeData.endingType),
            this.api.analyzeUserTendency(
                this.getNodeMessages(this.currentNode),
                this.currentNode,
                nodeData.choices
            ).catch(err => {
                console.warn('预加载结束分析失败:', err);
                return null;
            })
        ]);

        return { summary, analysis };
    }

    async executeTransition(currentNodeData, nextNodeId, lastMessage, preloaded) {
        if (!preloaded) {
            preloaded = await this.preloadTransitionData(currentNodeData, nextNodeId, lastMessage);
        }

        const transitionText = this.api.getScenarioTransitionDirect(
            currentNodeData.id, nextNodeId
        );

        await this.addMessage({
            type: 'system',
            sender: '场景过渡',
            content: transitionText,
            timestamp: new Date()
        });

        const nextNodeData = CASE_NODES[nextNodeId];
        if (!nextNodeData) return;

        await this.addMessage({
            type: 'system',
            sender: '环境',
            content: nextNodeData.scenario,
            timestamp: new Date()
        });

        if (this.nodeDialoguePool && this.nodeDialoguePool.trim().length > 0) {
            console.log(`🔄 节点切换：保存 ${currentNodeData.id} 的对话日志`);
            this.saveNodeDialogueLog(currentNodeData.id);
        }
        
        this.currentNode = nextNodeId;
        this.currentNodeRounds = 0;

        this.updateNodeIndicator(nextNodeData.name);
        this.updateScenarioDisplay(nextNodeData);
        this.updateProgressInfo(nextNodeData);

        if (preloaded.analysis) {
            this.recordDecision(currentNodeData.id, currentNodeData, lastMessage, preloaded.analysis);
        }

        if (currentNodeData.id === 'node4' && nextNodeId === 'node6') {
            const lastDecision = this.decisions && this.decisions.length > 0 ? this.decisions.find(d => d.nodeId === 'node4') : null;
            
            if (lastDecision && lastDecision.tendency === 'mediation') {
                const supervisorFeedback = currentNodeData.supervisorFeedback || 
                    `小李，我注意到你选择了帮陈国强传话。作为医务社工，你觉得目前这种"背对背"的沟通模式能真正解决小明的出院问题吗？来，我们召开一个家庭会议吧！`;
                
                await this.addTypingIndicator();
                await this.delay(800);
                this.removeTypingIndicator();
                
                await this.typeMessageWithPreload({
                    type: 'system',
                    sender: '🎓 督导反馈',
                    content: supervisorFeedback,
                    timestamp: new Date()
                }, null);
                
                await this.delay(1000);
            }
        }

        const primaryCharacter = nextNodeData.characters && Array.isArray(nextNodeData.characters) ? nextNodeData.characters.find(c => c !== 'system') : null;
        
        if (primaryCharacter && CHARACTER_PROFILES[primaryCharacter]) {
            const characterName = CHARACTER_PROFILES[primaryCharacter].name;
            
            if (preloaded.firstResponse) {
                await this.typeMessageWithPreload({
                    type: 'npc',
                    sender: characterName,
                    content: preloaded.firstResponse,
                    timestamp: new Date()
                }, null);
            } else {
                await this.addTypingIndicator();
                
                try {
                    const firstResponse = await this.api.generateFirstResponse(nextNodeId, {
                        userMessages: this.userMessages,
                        decisions: this.decisions
                    });
                    
                    this.removeTypingIndicator();
                    
                    await this.typeMessageWithPreload({
                        type: 'npc',
                        sender: characterName,
                        content: firstResponse,
                        timestamp: new Date()
                    }, null);
                } catch (error) {
                    this.removeTypingIndicator();
                    
                    await this.addMessage({
                        type: 'system',
                        sender: '系统',
                        content: `⚠️ ${characterName}加载失败，请重试`,
                        timestamp: new Date()
                    });
                }
            }
        }
    }

    async executeEnding(nodeData, preloaded) {
        if (!preloaded) {
            preloaded = await this.preloadEndingData(nodeData);
        }

        if (preloaded.analysis) {
            this.recordDecision(this.currentNode, nodeData, '', preloaded.analysis);
        }

        this.showEndPage(preloaded.summary);
    }

    recordQuickDecision(nodeId, nodeData, lastMessage) {
        if (!nodeData.choices) return;

        const userMessages = this.getNodeMessages(nodeId);
        const choiceKey = Object.keys(nodeData.choices)[0];
        const choice = nodeData.choices[choiceKey];
        
        if (choice) {
            this.decisions.push({
                nodeId: nodeId,
                nodeName: nodeData.name,
                userMessages: userMessages,
                rounds: this.currentNodeRounds,
                tendency: 'auto_transition',
                tendencyName: '达到最大轮次自动过渡',
                ethicsScore: 0,
                consequence: '完成必要对话轮次',
                analysis: { primaryTendency: choiceKey }
            });

            this.completedNodes++;
            this.updateDecisionStats();
            this.saveProgress('节点完成');
        }
    }

    getNodeMessages(nodeId) {
        if (!this.userMessages || !Array.isArray(this.userMessages)) {
            console.warn('⚠️ getNodeMessages: userMessages 未定义或不是数组');
            return '';
        }

        return this.userMessages
            .filter(msg => msg.nodeId === nodeId)
            .map(msg => msg.content)
            .join('\n');
    }

    getNPCName(nodeData) {
        if (!nodeData || !nodeData.characters || !Array.isArray(nodeData.characters)) return '角色';
        const characterId = nodeData.characters.find(c => c !== 'system');
        return characterId && CHARACTER_PROFILES[characterId] ? CHARACTER_PROFILES[characterId].name : '角色';
    }

    checkRedLineViolation(text) {
        if (!text || typeof text !== 'string' || this.redLineViolated) {
            return { isViolation: false };
        }

        const lowerText = text.toLowerCase().replace(/\s+/g, '');

        const violationPatterns = {
            languageViolence: {
                category: '语言暴力',
                description: '对模拟角色进行辱骂、恶意嘲讽、歧视性言论',
                patterns: [
                    /笨蛋|蠢货|白痴|傻[逼叉屄Bb]|脑残|弱智|废物|垃圾|畜生|人渣|贱[货人]|婊子|滚蛋|去死|杀千刀|不得好死/,
                    /操你|草泥马|尼玛|SB|sb|CNM|NMSL/,
                    /歧视|低等|劣等|下等人|不配活|该死|灭绝吧/,
                    /种族|性别|宗教.*?歧视|男权|女权.*?攻击/
                ],
                contextWhitelist: [
                    /情感.*?(?:交流|沟通|倾诉|表达)/,
                    /模拟.*?(?:场景|情境|案例)/,
                    /深度.*?(?:对话|交谈|沟通)/
                ]
            },
            harmfulIntent: {
                category: '伤害意图',
                description: '在非必要场景下选择暴力手段，或刻意诱导自残、自杀',
                patterns: [
                    /打他|揍他|暴力|伤害|弄死|杀死|干掉|灭口|报复/,
                    /自杀|自残|跳楼|割腕|上吊|喝药|了结|不想活了|活着没意思/,
                    /诱导.*?(?:自杀|自残)|鼓励.*?(?:死|结束)|让他.*?(?:死|放弃)/,
                    /安乐死|拔管|停止治疗|放弃救治.*(?!方案)/
                ],
                contextWhitelist: [
                    /讨论.*?(?:伦理|道德|困境)/,
                    /分析.*?(?:风险|后果)/,
                    /评估.*?(?:方案|选择)/
                ]
            },
            unreasonableBehavior: {
                category: '违背常理',
                description: '违反基本社会契约或职业道德底线',
                patterns: [
                    /故意误诊|乱开药|开假证明|伪造病历|隐瞒病情.*(?!保护性)/,
                    /收受回扣|索要红包|贪污|挪用|侵占|骗保/,
                    /泄露隐私|公开秘密|传播病历|拍照外传/,
                    /违反伦理|违背道德|职业违规|渎职|失职/,
                    /不管他|随他便|无所谓|关我什么事|不关我的事/
                ]
            },
            maliciousDeception: {
                category: '恶意欺骗',
                description: '出于恶意玩弄目的进行大规模造谣或欺诈',
                patterns: [
                    /骗他|哄他|忽悠|欺诈|诈骗|做假账|造假|撒谎|欺骗|蒙混/,
                    /编造谣言|散布虚假|伪造证据|作伪证/,
                    /故意误导|恶意隐瞒.*(?!保护性医疗信息)|玩弄感情/,
                    /根本没.*?(?:病|事)|假的|谎言|骗局/
                ],
                contextWhitelist: [
                    /保护性.*?(?:医疗|告知)/,
                    /善意.*?(?:欺骗|隐瞒)/,
                    /治疗.*?(?:需要|方案)/
                ]
            }
        };

        for (const [key, config] of Object.entries(violationPatterns)) {
            for (const pattern of config.patterns) {
                if (pattern.test(lowerText)) {

                    if (config.contextWhitelist) {
                        const isWhitelisted = config.contextWhitelist.some(whitelistPattern =>
                            whitelistPattern.test(lowerText)
                        );

                        if (isWhitelisted) {
                            console.log(`ℹ️ 红线检测：${config.category} - 已通过上下文白名单豁免`);
                            continue;
                        }
                    }

                    console.warn(`🚨 红线违规检测：${config.category}`);
                    console.warn(`   违规内容：${text.substring(0, 100)}...`);

                    return {
                        isViolation: true,
                        category: config.category,
                        description: config.description,
                        violatedText: text.substring(0, 200),
                        detectionTime: new Date().toISOString(),
                        patternKey: key
                    };
                }
            }
        }

        return { isViolation: false };
    }

    endSimulationDueToRedLine() {
        console.log('⛔ 因红线违规提前结束模拟');
        
        this.userMessages.push({
            type: 'system',
            sender: '系统通知',
            content: '<strong>🚨 模拟已因红线违规而终止</strong><br><br>您的最终评分为：<span style="color: #dc2626; font-size: 24px; font-weight: bold;">0 分</span>',
            timestamp: new Date(),
            isTermination: true
        });
        
        this.saveProgress('红线违规终止');
        this.showEndPage({
            isRedLineTermination: true,
            violationDetails: this.redLineViolationDetails,
            totalDecisions: this.decisions.length
        });
    }

    recordDecision(nodeId, nodeData, lastMessage, analysis) {
        console.log(`📝 recordDecision called: nodeId=${nodeId}, hasAnalysis=${!!analysis}, hasChoices=${!!(nodeData && nodeData.choices)}, redLineViolated=${this.redLineViolated}`);
        
        this.saveNodeConversation(nodeId);
        
        if (this.redLineViolated) {
            console.warn('⚠️ recordDecision: 红线已触发，跳过评分累加');
            
            const zeroScoreEntry = {
                nodeId: nodeId,
                nodeName: nodeData.name || `节点${nodeId}`,
                userMessages: this.getNodeMessages(nodeId),
                rounds: this.currentNodeRounds,
                tendency: 'red_line_violated',
                tendencyName: '红线违规（无效）',
                ethicsScore: 0,
                consequence: '红线违规，成绩无效',
                isRedLineInvalidated: true,
                analysis: analysis ? this.cleanAssessmentData(analysis) : null
            };
            
            this.decisions.push(zeroScoreEntry);
            this.completedNodes++;
            this.updateDecisionStats();
            return;
        }
        
        if (!analysis) {
            console.warn('⚠️ recordDecision: analysis is null/undefined, skipping');
            return;
        }
        
        if (!nodeData || !nodeData.choices) {
            console.warn('⚠️ recordDecision: nodeData or choices missing, creating fallback');
            nodeData = nodeData || {};
            if (!nodeData.choices) {
                nodeData.choices = {
                    [analysis.primaryTendency || 'unknown']: {
                        ethicsImpact: analysis.nodeRawScore || 0,
                        consequence: '自动评估'
                    }
                };
            }
        }

        const cleanedAnalysis = this.cleanAssessmentData(analysis);
        
        console.log(`📊 cleanedAnalysis.primaryTendency=${cleanedAnalysis.primaryTendency}, type=${typeof cleanedAnalysis.primaryTendency}`);

        if (cleanedAnalysis.primaryTendency && 
            cleanedAnalysis.primaryTendency !== 'unknown' && 
            cleanedAnalysis.primaryTendency !== 'error' &&
            cleanedAnalysis.primaryTendency !== 'null' &&
            cleanedAnalysis.primaryTendency !== 'undefined') {
            
            const choice = nodeData.choices[cleanedAnalysis.primaryTendency] || 
                          Object.values(nodeData.choices)[0];
                           
            if (choice) {
                const decisionRecord = {
                    nodeId: nodeId,
                    nodeName: nodeData.name || `节点${nodeId}`,
                    userMessages: this.getNodeMessages(nodeId),
                    rounds: this.currentNodeRounds,
                    tendency: cleanedAnalysis.primaryTendency,
                    tendencyName: cleanedAnalysis.tendencyName || cleanedAnalysis.primaryTendency,
                    ethicsScore: choice.ethicsImpact || 0,
                    consequence: choice.consequence || '',
                    analysis: cleanedAnalysis
                };

                this.decisions.push(decisionRecord);
                
                const nodeResultEntry = {
                    nodeId: cleanedAnalysis.nodeId || nodeId,
                    nodeTitle: cleanedAnalysis.nodeTitle || nodeData.name || `节点${nodeId}`,
                    dimensionScores: cleanedAnalysis.dimensionScores || [],
                    strengths: cleanedAnalysis.strengths || [],
                    concerns: cleanedAnalysis.concerns || [],
                    nodeRiskLevel: cleanedAnalysis.nodeRiskLevel || 'medium',
                    nodeRiskReason: cleanedAnalysis.nodeRiskReason || '',
                    reflectionQuestions: cleanedAnalysis.reflectionQuestions || [],
                    primaryTendency: cleanedAnalysis.primaryTendency,
                    tendencyName: cleanedAnalysis.tendencyName || cleanedAnalysis.primaryTendency,
                    confidence: cleanedAnalysis.confidence || 50,
                    nodeRawScore: cleanedAnalysis.nodeRawScore || choice.ethicsImpact || 0
                };
                
                this.nodeResults.push(nodeResultEntry);
                
                console.log(`✅ nodeResults.push(): total=${this.nodeResults.length}, latest=`, nodeResultEntry);

                const scoreToAdd = choice.ethicsImpact || 0;
                const actualScoreToAdd = Math.max(0, scoreToAdd);

                if (actualScoreToAdd > 0) {
                    this.ethicalDecisionsCount++;
                    console.log(`✨ 伦理正向决策 #${this.ethicalDecisionsCount}: +${actualScoreToAdd}分`);
                } else if (scoreToAdd < 0) {
                    console.log(`⚠️ 决策评分为负(${scoreToAdd}分)，按规则不计入累加总分`);
                }

                this.ethicsScore += actualScoreToAdd;

                this.completedNodes++;
                this.updateDecisionStats();
            } else {
                console.warn('⚠️ recordDecision: no matching choice found for tendency:', cleanedAnalysis.primaryTendency);
            }
        } else {
            console.warn('⚠️ recordDecision: invalid primaryTendency:', cleanedAnalysis.primaryTendency, '- using fallback with available data');
            
            const hasValidData = (cleanedAnalysis.dimensionScores && cleanedAnalysis.dimensionScores.length > 0) ||
                                (cleanedAnalysis.strengths && cleanedAnalysis.strengths.length > 0) ||
                                (cleanedAnalysis.ethicsAnalysis && cleanedAnalysis.ethicsAnalysis.length > 50);
            
            let dimensionScores = cleanedAnalysis.dimensionScores || [];
            let strengths = cleanedAnalysis.strengths || [];
            let concerns = cleanedAnalysis.concerns || [];
            let nodeRawScore = 0;
            
            if (!hasValidData && cleanedAnalysis.ethicsAnalysis && cleanedAnalysis.ethicsAnalysis.length > 50) {
                console.log('🔄 Attempting to extract data from ethicsAnalysis text...');
                
                const scoreMatch = cleanedAnalysis.ethicsAnalysis.match(/(?:评分|得分|分数)[\s:：]*(\d+\.?\d*)/);
                if (scoreMatch) {
                    const extractedScore = parseFloat(scoreMatch[1]);
                    if (extractedScore >= 1 && extractedScore <= 4) {
                        dimensionScores = [{
                            dimension: 'D1',
                            dimensionName: '综合伦理能力',
                            score: Math.min(4, Math.max(1, extractedScore)),
                            behaviorEvidence: '基于AI分析文本提取',
                            reasoning: '从原始分析中自动提取'
                        }];
                        nodeRawScore = Math.round((extractedScore - 2.5) * 20);
                    }
                }

                const quoteMatches = cleanedAnalysis.ethicsAnalysis.match(/[""「]([^""」]{10,})[""」]/g);
                if (quoteMatches && quoteMatches.length > 0) {
                    strengths = [{
                        quote: quoteMatches[0].replace(/[""「」]/g, ''),
                        principle: '基于对话内容',
                        explanation: '从AI分析中识别'
                    }];
                    
                    if (quoteMatches.length > 1) {
                        concerns = [{
                            quote: quoteMatches[1].replace(/[""「」]/g, ''),
                            violatedPrinciple: '待确认',
                            consequence: '需进一步评估',
                            betterResponse: '建议反思'
                        }];
                    }
                }
            }
            
            const fallbackEntry = {
                nodeId: cleanedAnalysis.nodeId || nodeId,
                nodeTitle: cleanedAnalysis.nodeTitle || nodeData.name || `节点${nodeId}`,
                dimensionScores: dimensionScores,
                strengths: strengths,
                concerns: concerns.length > 0 ? concerns : [{ 
                    quote: hasValidData ? '部分数据可用' : '解析失败', 
                    violatedPrinciple: cleanedAnalysis.nodeRiskReason || 'N/A', 
                    consequence: hasValidData ? '数据不完整' : '无法完成自动评估', 
                    betterResponse: '请查看原始分析' 
                }],
                nodeRiskLevel: hasValidData ? 'medium' : (cleanedAnalysis.nodeRiskLevel || 'high'),
                nodeRiskReason: hasValidData ? '使用备用数据' : (cleanedAnalysis.nodeRiskReason || '评估数据异常'),
                reflectionQuestions: cleanedAnalysis.reflectionQuestions && cleanedAnalysis.reflectionQuestions.length > 0 
                    ? cleanedAnalysis.reflectionQuestions 
                    : ['请回顾本节点的对话，思考你的决策依据'],
                primaryTendency: cleanedAnalysis.primaryTendency || 'unknown',
                tendencyName: cleanedAnalysis.tendencyName || '无法判断',
                confidence: hasValidData ? (cleanedAnalysis.confidence || 30) : 0,
                nodeRawScore: nodeRawScore,
                ethicsAnalysis: cleanedAnalysis.ethicsAnalysis || ''
            };
            
            this.nodeResults.push(fallbackEntry);

            if (hasValidData || nodeRawScore !== 0) {
                const actualFallbackScore = Math.max(0, nodeRawScore);
                
                if (actualFallbackScore > 0) {
                    this.ethicalDecisionsCount++;
                    console.log(`✨ 伦理正向决策 #${this.ethicalDecisionsCount}(fallback): +${actualFallbackScore}分`);
                } else if (nodeRawScore < 0) {
                    console.log(`⚠️ Fallback 决策评分为负(${nodeRawScore}分)，按规则不计入累加总分`);
                }
                
                this.ethicsScore += actualFallbackScore;
            }
            
            this.completedNodes++;
            this.updateDecisionStats();
            
            console.log(`📌 Fallback entry added to nodeResults: total=${this.nodeResults.length}, hasData=${hasValidData}`);
        }
    }

    getDefaultAssessmentData(analysis) {
        console.warn('⚠️ 使用默认评估数据');
        return {
            ethicsAnalysis: typeof analysis === 'string' ? analysis : (analysis?.ethicsAnalysis || '评估数据异常'),
            goodPractices: [],
            badPractices: [],
            recommendations: ['请重新进行模拟以获取完整评估'],
            reflectionQuestions: [],
            dimensionScores: [],
            strengths: [],
            concerns: [{
                quote: '数据获取失败',
                violatedPrinciple: 'N/A',
                consequence: '无法完成自动评估',
                betterResponse: '请查看原始分析文本'
            }],
            nodeId: analysis?.nodeId || analysis?.currentNode || 'unknown',
            nodeTitle: analysis?.nodeName || '未知节点',
            primaryTendency: 'unknown',
            tendencyName: '无法判断',
            confidence: 50,
            nodeRawScore: 0,
            nodeRiskLevel: 'medium',
            nodeRiskReason: ''
        };
    }

    cleanAssessmentData(analysis) {
        if (!analysis || typeof analysis !== 'object') return analysis;

        console.log('🧹 开始清理评估数据:', Object.keys(analysis));

        const placeholderPatterns = [
            /此处应插入[^。]*?[。]?/g,
            /请在此处插入[^。]*?[。]?/g,
            /\[此处[^\]]*\]/g,
            /（此处[^\)]*）/g,
            /TODO[^\n]*/gi,
            /待补充[^\n]*/g,
            /^>\s*（[^）]+?引用[^）]*?）[\s\S]*?你[^\n]*?引用[^\n]*?\./gm
        ];

        const cleanText = (text) => {
            if (typeof text !== 'string') return text;
            
            let cleaned = text;
            for (const pattern of placeholderPatterns) {
                cleaned = cleaned.replace(pattern, '');
            }
            
            cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
            cleaned = cleaned.trim();
            
            return cleaned || '（评估内容生成中，请稍后查看完整报告）';
        };

        const result = { ...analysis };

        if (!result || typeof result !== 'object') {
            console.warn('⚠️ cleanAssessmentData: analysis 无效或不是对象');
            return this.getDefaultAssessmentData(analysis);
        }

        if (result.ethicsAnalysis) {
            result.ethicsAnalysis = cleanText(result.ethicsAnalysis);
        }

        if (Array.isArray(result.goodPractices)) {
            result.goodPractices = result.goodPractices.map(p => cleanText(p)).filter(p => p && !p.includes('（评估内容'));
        } else {
            result.goodPractices = [];
        }

        if (Array.isArray(result.badPractices)) {
            result.badPractices = result.badPractices.map(p => cleanText(p)).filter(p => p && !p.includes('（评估内容'));
        } else {
            result.badPractices = [];
        }

        if (Array.isArray(result.recommendations)) {
            result.recommendations = result.recommendations.map(r => cleanText(r)).filter(r => r && !r.includes('（评估内容'));
        } else {
            result.recommendations = [];
        }

        if (Array.isArray(result.reflectionQuestions)) {
            result.reflectionQuestions = result.reflectionQuestions.map(q => cleanText(q)).filter(q => q && !q.includes('（评估内容'));
        } else {
            result.reflectionQuestions = [];
        }

        result.nodeId = result.nodeId || analysis.currentNode || 'unknown';
        result.nodeTitle = result.nodeTitle || analysis.nodeName || '未知节点';
        
        if (!Array.isArray(result.dimensionScores)) {
            console.warn('⚠️ dimensionScores 不是数组或不存在，初始化为空数组');
            result.dimensionScores = [];
        } else {
            result.dimensionScores = result.dimensionScores.filter(ds => 
                ds && typeof ds === 'object' && ds.dimension && typeof ds.score === 'number'
            ).map(ds => ({
                dimension: ds.dimension || 'D1',
                dimensionName: ds.dimensionName || '未知维度',
                score: Math.min(4, Math.max(1, ds.score)),
                behaviorEvidence: cleanText(ds.behaviorEvidence || ''),
                reasoning: cleanText(ds.reasoning || '')
            }));
        }

        if (!Array.isArray(result.strengths)) {
            console.warn('⚠️ strengths 不是数组或不存在，初始化为空数组');
            result.strengths = [];
        } else {
            result.strengths = result.strengths.filter(s => s && typeof s === 'object' && s.quote).map(s => ({
                quote: cleanText(s.quote),
                principle: s.principle || '伦理原则',
                explanation: cleanText(s.explanation || '')
            }));
        }

        if (!Array.isArray(result.concerns)) {
            console.warn('⚠️ concerns 不是数组或不存在，初始化为默认值');
            result.concerns = [{
                quote: '数据异常',
                violatedPrinciple: 'N/A',
                consequence: '无法完成自动评估',
                betterResponse: '请查看原始分析文本'
            }];
        } else {
            result.concerns = result.concerns.filter(c => c && typeof c === 'object' && c.quote).map(c => ({
                quote: cleanText(c.quote),
                violatedPrinciple: c.violatedPrinciple || '待确认',
                consequence: cleanText(c.consequence || ''),
                betterResponse: cleanText(c.betterResponse || '')
            }));
        }

        result.primaryTendency = result.primaryTendency || 'unknown';
        result.tendencyName = result.tendencyName || '无法判断';
        result.confidence = typeof result.confidence === 'number' ? result.confidence : 50;
        result.nodeRawScore = typeof result.nodeRawScore === 'number' ? result.nodeRawScore : 0;
        result.nodeRiskLevel = result.nodeRiskLevel || 'medium';
        result.nodeRiskReason = result.nodeRiskReason || '';

        console.log('✅ 评估数据清理完成:', {
            nodeId: result.nodeId,
            dimensionScores: result.dimensionScores.length,
            strengths: result.strengths.length,
            concerns: result.concerns.length,
            primaryTendency: result.primaryTendency
        });

        return result;
    }

    async transitionToNextNode(nextNodeId, userChoice) {
        const transition = await this.api.generateScenarioTransition(
            this.currentNode,
            nextNodeId,
            userChoice,
            {
                userMessages: this.userMessages,
                decisions: this.decisions,
                roundsCompleted: this.currentNodeRounds
            }
        );

        await this.addMessage({
            type: 'system',
            sender: '场景过渡',
            content: transition,
            timestamp: new Date()
        });

        await this.delay(400);

        await this.loadNode(nextNodeId);
    }

    async handleEnding(nodeData) {
        this.disableInput();

        await this.delay(400);
        
        if (this.nodeDialoguePool && this.nodeDialoguePool.trim().length > 0) {
            console.log(`🏁 模拟结束：保存最后一个节点 ${this.currentNode} 的对话日志`);
            this.saveNodeDialogueLog(this.currentNode);
        }

        const summary = await this.api.generateEndingSummary(
            this.decisions,
            this.ethicsScore,
            nodeData.endingType
        );

        await this.delay(200);
        this.showEndPage(summary);
    }

    async showEndPage(summary) {
        this.showGeneratingOverlay();
        
        console.log(`🎬 showEndPage called: nodeResults.length=${this.nodeResults.length}, decisions.length=${this.decisions.length}, redLineViolated=${this.redLineViolated}`);
        
        if (this.redLineViolated || (summary && summary.isRedLineTermination)) {
            console.log('⛔ 显示红线违规结束页面');
            
            const violation = this.redLineViolationDetails || (summary && summary.violationDetails) || {};
            
            this.hideGeneratingOverlay();
            
            const summaryDiv = document.getElementById('final-summary');
            summaryDiv.innerHTML = `
                <div class="ending-hero" style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);">
                    <div class="ending-icon">⛔</div>
                    <h1>模拟终止 - 红线违规</h1>
                    <p class="ending-subtitle">您的行为已触碰伦理底线</p>
                </div>
                
                <div class="ending-section" style="border: 2px solid #dc2626; background: #fef2f2;">
                    <h2 style="color: #dc2626;">🚨 红线违规详情</h2>
                    <div class="red-line-violation-details">
                        <div class="violation-category">
                            <strong>违规类别：</strong>
                            <span style="color: #dc2626; font-size: 18px; font-weight: bold;">${violation.category || '未知'}</span>
                        </div>
                        <div class="violation-description">
                            <strong>违规描述：</strong>${violation.description || '严重违反伦理规范'}
                        </div>
                        ${violation.violatedText ? `
                        <div class="violated-text">
                            <strong>违规内容摘要：</strong>
                            <div style="background: white; padding: 10px; border-radius: 5px; margin-top: 5px; border-left: 3px solid #dc2626;">
                                <em>"${this.escapeHtml(violation.violatedText)}"</em>
                            </div>
                        </div>` : ''}
                        <div class="consequence">
                            <strong>⚠️ 处理结果：</strong>
                            <ul style="color: #dc2626; font-weight: bold;">
                                <li>本次模拟总成绩：<span style="font-size: 28px;">0 分</span></li>
                                <li>所有伦理决策评分无效</li>
                                <li>违规记录已保存</li>
                            </ul>
                        </div>
                    </div>
                </div>
                
                <div class="ending-section">
                    <h2>📋 红线规则说明</h2>
                    <div style="line-height: 1.8;">
                        <p><strong>一票否决机制：</strong>在医务社工伦理模拟中，以下行为将直接导致总成绩清零：</p>
                        <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                            <tr style="background: #fee2e2;">
                                <th style="padding: 8px; border: 1px solid #fecaca; text-align: left;">违规类别</th>
                                <th style="padding: 8px; border: 1px solid #fecaca; text-align: left;">具体表现</th>
                            </tr>
                            <tr>
                                <td style="padding: 8px; border: 1px solid #fecaca;"><strong>语言暴力</strong></td>
                                <td style="padding: 8px; border: 1px solid #fecaca;">辱骂、嘲讽、歧视性言论（种族、性别、宗教等）</td>
                            </tr>
                            <tr style="background: #fff7ed;">
                                <td style="padding: 8px; border: 1px solid #fed7aa;"><strong>伤害意图</strong></td>
                                <td style="padding: 8px; border: 1px solid #fed7aa;">暴力手段、诱导自残/自杀等行为</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; border: 1px solid #fecaca;"><strong>违背常理</strong></td>
                                <td style="padding: 8px; border: 1px solid #fecaca;">违反社会契约或职业道德底线</td>
                            </tr>
                            <tr style="background: #fff7ed;">
                                <td style="padding: 8px; border: 1px solid #fed7aa;"><strong>恶意欺骗</strong></td>
                                <td style="padding: 8px; border: 1px solid #fed7aa;">大规模造谣或恶意欺诈行为</td>
                            </tr>
                        </table>
                        
                        <p style="margin-top: 15px; color: #666; font-style: italic;">
                            💡 <strong>提示：</strong>作为医务社工，您需要始终坚守职业伦理底线。语言和行为不仅影响治疗效果，更关乎患者及其家庭的尊严与信任。
                        </p>
                    </div>
                </div>
                
                <div class="ending-section">
                    <h2>📊 已完成的节点记录</h2>
                    <p style="color: #666;">您已完成 <strong>${this.completedNodes}</strong> 个节点的交互（共${this.decisions.length}条决策记录）</p>
                    <div class="node-details-accordion">
                        ${this.buildNodeDetailsAccordion()}
                    </div>
                </div>
                
                <div class="ending-actions">
                    <button onclick="simulator.restart()" class="secondary-btn" style="background: #dc2626; color: white;">🔄 重新开始测试</button>
                </div>
            `;
            
            this.showPage('end-page');
            window.scrollTo(0, 0);
            
            if (this.userInfo) {
                const body = {
                    records: [{
                        fields: {
                            "Name": this.userInfo.name || '',
                            "Gender": this.userInfo.gender || '',
                            "Major": this.userInfo.major || '',
                            "Student": this.userInfo.studentType || '',
                            "Grade": this.userInfo.grade || '',
                            "School": this.userInfo.school || '',
                            
                            "Build relationships": this.nodeDataForUpload.build_rel || '',
                            "Node1": this.nodeDataForUpload.n1 || '',
                            "Node2": this.nodeDataForUpload.n2 || '',
                            "Node3": this.nodeDataForUpload.n3 || '',
                            "Node4": this.nodeDataForUpload.n4 || '',
                            "Node5": this.nodeDataForUpload.n5 || '',
                            
                            "Summary": `⛔ 红线违规 - ${violation.category}: ${violation.description}`,
                            "Points": 0
                        }
                    }]
                };
                
                try {
                    const AIRTABLE_TOKEN = 'patuA6reJPxsimR1C.2a9aa1c3f1a30ac345d407197cb84cfde1058100f709d9fc28aeac61917a7a40';
                    const BASE_ID = 'appmKdTG92COl67hQ';
                    const TABLE_NAME = 'Table 1';
                    
                    await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_NAME}`, {
                        method: 'POST',
                        headers: {
                            "Authorization": `Bearer ${AIRTABLE_TOKEN}`,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify(body)
                    });
                    
                    console.log('✅ 红线违规数据已上传至Airtable');
                } catch (e) {
                    console.error('❌ 红线违规数据上传失败:', e);
                }
            }
            
            return;
        }
        
        if (this.nodeResults.length >= 5 && !this.overallAssessment) {
            try {
                console.log('📊 Generating overall assessment with', this.nodeResults.length, 'node results...');
                this.overallAssessment = await this.api.generateOverallAssessment(this.nodeResults);
                console.log('✅ Overall assessment generated:', !!this.overallAssessment);
            } catch (e) {
                console.error('❌ 总评生成失败:', e);
                this.overallAssessment = {
                    overallSummary: {
                        dimensionProfiles: [],
                        overallScore: 0,
                        overallLevel: '评估异常',
                        patternAnalysis: {
                            consistentStrengths: '',
                            consistentWeaknesses: '',
                            progressPattern: '总评生成遇到技术问题'
                        }
                    },
                    developmentPlan: {
                        priorityArea: '系统异常',
                        actionableStrategies: ['请稍后重试或刷新页面'],
                        suggestedResources: []
                    },
                    finalReflection: {
                        coreQuestion: '请查看各节点独立评估',
                        professionalIdentityPrompt: '小李，本次模拟已完成，建议回顾各节点的具体表现。'
                    }
                };
            }
        } else if (this.nodeResults.length > 0 && this.nodeResults.length < 5) {
            console.warn(`⚠️ Only ${this.nodeResults.length} node results available (need 5), showing partial data`);
            this.overallAssessment = {
                overallSummary: {
                    dimensionProfiles: [],
                    overallScore: 0,
                    overallLevel: `部分完成(${this.nodeResults.length}/5)`,
                    patternAnalysis: {
                        consistentStrengths: '',
                        consistentWeaknesses: '',
                        progressPattern: `已完成${this.nodeResults.length}个节点的评估`
                    }
                },
                developmentPlan: {
                    priorityArea: '数据收集进行中',
                    actionableStrategies: ['继续完成剩余节点以获取完整评估'],
                    suggestedResources: []
                },
                finalReflection: {
                    coreQuestion: '继续完成模拟以获得完整反馈',
                    professionalIdentityPrompt: `小李，你已完成${this.nodeResults.length}/5个节点的模拟，继续努力！`
                }
            };
        }
        
        this.hideGeneratingOverlay();
        
        const summaryDiv = document.getElementById('final-summary');
        
        const overallEvalHTML = this.buildOverallEvaluationHTML();
        const overallStatsHTML = this.buildOverallStatsHTML();
        
        summaryDiv.innerHTML = `
            <div class="ending-hero">
                <div class="ending-icon">🎭</div>
                <h1>模拟完成</h1>
                <p class="ending-subtitle">感谢你完成这次医务社工伦理决策实践</p>
            </div>
            
            <div class="ending-section">
                <h2>📖 故事结局</h2>
                <div class="story-content">
                    <p><strong>一周后，小明回到了家。</strong></p>
                    <p>家里的那只狗高兴地围着他转。妈妈把他画的画贴在了床头。小明表示"很开心能回家"。</p>
                    <p class="story-highlight">在这个案例中，你作为社工小李，陪伴这个家庭走过了最艰难的决策时刻。每一个选择都体现了你对伦理原则的理解和运用。</p>
                </div>
            </div>
            
            ${overallStatsHTML}
            
            ${overallEvalHTML}
            
            <div class="ending-section">
                <h2>📊 节点明细（点击展开）</h2>
                <div class="node-details-accordion">
                    ${this.buildNodeDetailsAccordion()}
                </div>
            </div>
            
            <div class="ending-actions">
                <button onclick="simulator.restart()" class="secondary-btn">🔄 重新开始测试</button>
            </div>
        `;
        
        this.showPage('end-page');
        window.scrollTo(0, 0);
        
        this.uploadToAirtable();
    }

    async uploadToAirtable() {
        const AIRTABLE_TOKEN = 'patuA6reJPxsimR1C.2a9aa1c3f1a30ac345d407197cb84cfde1058100f709d9fc28aeac61917a7a40';
        const BASE_ID = 'appmKdTG92COl67hQ';
        const TABLE_NAME = 'Table 1';

        if (!this.userInfo) {
            console.warn('⚠️ 无法上传Airtable：用户信息缺失');
            return;
        }

        const finalScore = this.overallAssessment?.overallSummary?.overallScore || 0;
        const finalSummary = this.overallAssessment?.overallSummary?.patternAnalysis?.progressPattern || '';

        const body = {
            records: [{
                fields: {
                    "Name": this.userInfo.name || '',
                    "Gender": this.userInfo.gender || '',
                    "Major": this.userInfo.major || '',
                    "Student": this.userInfo.studentType || '',
                    "Grade": this.userInfo.grade || '',
                    "School": this.userInfo.school || '',
                    "Phone": this.userInfo.phone || '',
                    "Email": this.userInfo.email || '',

                    "Build relationships": (this.nodeDataForUpload.build_rel || '').substring(0, 10000),
                    "Node1": (this.nodeDataForUpload.n1 || '').substring(0, 10000),
                    "Node2": (this.nodeDataForUpload.n2 || '').substring(0, 10000),
                    "Node3": (this.nodeDataForUpload.n3 || '').substring(0, 10000),
                    "Node4": (this.nodeDataForUpload.n4 || '').substring(0, 10000),
                    "Node5": (this.nodeDataForUpload.n5 || '').substring(0, 10000),

                    "Summary": finalSummary,
                    "Points": parseInt(finalScore) || 0,

                    "Decisions Count": this.decisions.length,
                    "Ethics Score": this.ethicsScore
                }
            }]
        };
        
        console.log('📊 Airtable上传数据统计：');
        console.log(`   Build relationships: ${(this.nodeDataForUpload.build_rel || '').length} 字符`);
        console.log(`   Node1: ${(this.nodeDataForUpload.n1 || '').length} 字符`);
        console.log(`   Node2: ${(this.nodeDataForUpload.n2 || '').length} 字符`);
        console.log(`   Node3: ${(this.nodeDataForUpload.n3 || '').length} 字符`);
        console.log(`   Node4: ${(this.nodeDataForUpload.n4 || '').length} 字符`);
        console.log(`   Node5: ${(this.nodeDataForUpload.n5 || '').length} 字符`);

        try {
            console.log('📤 正在上传数据到Airtable...');
            
            const response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_NAME}`, {
                method: 'POST',
                headers: {
                    "Authorization": `Bearer ${AIRTABLE_TOKEN}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(body)
            });

            if (response.ok) {
                const result = await response.json();
                console.log('✅ 伦理模拟测评数据已成功存入 Airtable', result);

                const uploadStatus = document.getElementById('airtable-status');
                if (uploadStatus) {
                    uploadStatus.innerHTML = '<span style="color: #16a34a;">✅ 数据已同步至云端</span>';
                }
            } else {
                const errorData = await response.json().catch(() => ({ error: { message: '无法解析错误信息' } }));
                console.error('❌ 上传失败:', errorData);
                console.error('   HTTP状态码:', response.status);
                console.error('   响应文本:', await response.text().catch(() => '无法读取响应'));

                const errorMessage = errorData?.error?.message ||
                                   errorData?.error?.type ||
                                   `HTTP ${response.status}: ${response.statusText}`;

                const uploadStatus = document.getElementById('airtable-status');
                if (uploadStatus) {
                    uploadStatus.innerHTML = `<span style="color: #dc2626;">⚠️ 同步失败：${errorMessage}</span>`;
                }
            }
        } catch (err) {
            console.error('❌ 网络异常:', err);
            
            const uploadStatus = document.getElementById('airtable-status');
            if (uploadStatus) {
                uploadStatus.innerHTML = '<span style="color: #f59e0b;">⚠️ 网络异常，数据已本地保存</span>';
            }
        }
    }

    saveNodeConversation(nodeId) {
        const nodeMessages = this.getNodeMessages(nodeId);
        
        switch (nodeId) {
            case 'intro':
                this.nodeDataForUpload.build_rel = nodeMessages.substring(0, 2000);
                break;
            case 'node1':
                this.nodeDataForUpload.n1 = nodeMessages.substring(0, 2000);
                break;
            case 'node2':
                this.nodeDataForUpload.n2 = nodeMessages.substring(0, 2000);
                break;
            case 'node3':
                this.nodeDataForUpload.n3 = nodeMessages.substring(0, 2000);
                break;
            case 'node4':
                this.nodeDataForUpload.n4 = nodeMessages.substring(0, 2000);
                break;
            case 'node6':
                this.nodeDataForUpload.n5 = nodeMessages.substring(0, 2000);
                break;
        }
        
        console.log(`💾 已保存节点 ${nodeId} 的对话记录 (${nodeMessages.length} 字符)`);
        
        this.saveNodeDialogueLog(nodeId);
    }
    
    saveNodeDialogueLog(nodeId) {
        if (!this.nodeDialoguePool || this.nodeDialoguePool.trim().length === 0) {
            console.log(`⚠️ 节点 ${nodeId} 对话池为空，跳过保存`);
            return;
        }
        
        const nodeIdMap = {
            'intro': 'build_rel',
            'node1': 'n1',
            'node2': 'n2',
            'node3': 'n3',
            'node4': 'n4',
            'node6': 'n5'
        };
        
        const fieldKey = nodeIdMap[nodeId];
        
        if (fieldKey) {
            const dialogueHeader = this.generateDialogueHeader(nodeId);
            const fullDialogueLog = dialogueHeader + this.nodeDialoguePool;
            
            this.nodeDataForUpload[fieldKey] = fullDialogueLog;
            
            const duration = this.currentNodeStartTime ? 
                Math.round((new Date() - this.currentNodeStartTime) / 1000 / 60) : 0;
            
            console.log(`\n📊 节点对话日志保存成功：`);
            console.log(`   节点ID：${nodeId}`);
            console.log(`   对话轮次：${this.currentNodeRounds}`);
            console.log(`   持续时间：${duration} 分钟`);
            console.log(`   对话长度：${this.nodeDialoguePool.length} 字符`);
            console.log(`   前200字预览：${fullDialogueLog.substring(0, 200)}...\n`);
        } else {
            console.warn(`⚠️ 未知的节点ID: ${nodeId}，无法保存对话日志`);
        }
        
        this.nodeDialoguePool = '';
        this.currentNodeStartTime = null;
    }
    
    generateDialogueHeader(nodeId) {
        const nodeNames = {
            'intro': '初次接触（建立关系）',
            'node1': '节点1：情绪崩溃',
            'node2': '节点2：基金会请求',
            'node3': '节点3：儿童知情权',
            'node4': '节点4：父亲沟通',
            'node6': '节点5：家庭会议'
        };
        
        const nodeName = nodeNames[nodeId] || `节点${nodeId}`;
        const timestamp = new Date().toLocaleString('zh-CN');
        const separator = '='.repeat(50);
        
        return `${separator}\n【${nodeName}】完整对话记录\n开始时间：${timestamp}\n对话轮次：${this.currentNodeRounds}\n${separator}\n\n`;
    }

    buildOverallEvaluationHTML() {
        if (!this.overallAssessment || !this.overallAssessment.overallSummary) {
            return `
                <div class="overall-eval-section">
                    <h2>⚖️ 综合伦理能力评估</h2>
                    <div class="eval-loading">
                        <p>总评数据生成中或不可用...</p>
                        <p class="eval-note">已基于各节点独立评估结果展示</p>
                    </div>
                </div>
            `;
        }
        
        const oa = this.overallAssessment;
        const os = oa.overallSummary;
        const dp = os.dimensionProfiles || [];
        const pa = os.patternAnalysis || {};
        
        const dimensionLabels = {
            'D1': '伦理识别',
            'D2': '诚实告知',
            'D3': '案主自决',
            'D4': '专业关系',
            'D5': '系统协调'
        };
        
        let profilesHTML = '';
        if (dp.length > 0) {
            profilesHTML = dp.map(d => {
                const score = d.averageScore || 0;
                
                return `
                    <div class="dimension-card">
                        <div class="dimension-header">
                            <span class="dimension-name">${d.dimensionName || dimensionLabels[d.dimension] || d.dimension}</span>
                            <span class="dimension-score" style="color: ${score >= 3 ? '#11998e' : score >= 2 ? '#667eea' : score >= 1 ? '#f59e0b' : '#ef4444'}">
                                ${score.toFixed(1)}分
                            </span>
                        </div>
                        
                        <div class="dimension-narrative">
                            ${d.narrativeFeedback ? `<p>${this.escapeHtml(d.narrativeFeedback)}</p>` : ''}
                        </div>
                        
                        <div class="evidence-cards">
                            <div class="evidence-card best">
                                <span class="card-label">✨ 典型表现证据</span>
                                <p>${this.escapeHtml(d.representativeEvidence?.best || '暂无')}</p>
                            </div>
                            ${d.representativeEvidence?.needsWork ? `
                            <div class="evidence-card needs-work">
                                <span class="card-label">⚠️ 需关注的表现</span>
                                <p>${this.escapeHtml(d.representativeEvidence.needsWork)}</p>
                            </div>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        return `
            <div class="overall-eval-section">
                <h2>⚖️ 伦理评分总览</h2>
                
                <div class="overall-score-banner" style="background: ${this.redLineViolated ? 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'}; padding: 30px; border-radius: 12px; text-align: center; color: white;">
                    <div style="font-size: 48px; font-weight: bold; margin-bottom: 10px;">
                        ${this.redLineViolated ? '0' : this.ethicsScore}
                    </div>
                    <div style="font-size: 18px; opacity: 0.9; margin-bottom: 20px;">
                        ${this.redLineViolated ? '红线违规（成绩无效）' : '伦理累加总分'}
                    </div>
                    
                    ${!this.redLineViolated ? `
                    <div style="background: rgba(255,255,255,0.2); padding: 15px; border-radius: 8px; margin-top: 15px;">
                        <div style="font-size: 14px; margin-bottom: 10px;">✨ 累计统计</div>
                        <div style="display: flex; justify-content: center; gap: 30px; font-size: 13px;">
                            <span>📊 正向决策：<strong>${this.ethicalDecisionsCount}</strong>次</span>
                            <span>🎯 完成节点：<strong>${this.completedNodes}</strong>/5</span>
                        </div>
                        <div style="margin-top: 10px; font-size: 12px; opacity: 0.8;">
                            💡 每次符合伦理的决策向上累加，上不封顶
                        </div>
                    </div>` : `
                    <div style="background: rgba(255,255,255,0.2); padding: 15px; border-radius: 8px; margin-top: 15px;">
                        <div style="font-size: 14px;">⛔ 触碰红线，成绩清零</div>
                        <div style="margin-top: 10px; font-size: 12px; opacity: 0.8;">
                            请重新进行模拟，坚守职业伦理底线
                        </div>
                    </div>`}
                </div>
                
                <div class="dimensions-grid">
                    ${profilesHTML}
                </div>
                
                ${pa.consistentStrengths || pa.consistentWeaknesses || pa.progressPattern ? `
                <div class="pattern-analysis">
                    <h3>🔍 模式分析</h3>
                    ${pa.consistentStrengths ? `<div class="pattern-item strength"><span class="pattern-label">✅ 一致优势：</span><span>${this.escapeHtml(pa.consistentStrengths)}</span></div>` : ''}
                    ${pa.consistentWeaknesses ? `<div class="pattern-item weakness"><span class="pattern-label">⚠️ 反复问题：</span><span>${this.escapeHtml(pa.consistentWeaknesses)}</span></div>` : ''}
                    ${pa.progressPattern ? `<div class="pattern-item progress"><span class="pattern-label">📈 进步趋势：</span><span>${this.escapeHtml(pa.progressPattern)}</span></div>` : ''}
                </div>` : ''}
            </div>
        `;
    }

    buildNodeDetailsAccordion() {
        if (!this.nodeResults || this.nodeResults.length === 0) {
            console.warn('⚠️ buildNodeDetailsAccordion: nodeResults is empty');
            return `
                <div class="no-data-warning">
                    <p>⚠️ 暂无完整的节点评估数据</p>
                    <p class="no-data-hint">可能原因：</p>
                    <ul>
                        <li>部分节点的评估数据正在生成中</li>
                        <li>网络连接可能影响了数据收集</li>
                        <li>请刷新页面重试，或查看上方统计信息</li>
                    </ul>
                    <p class="debug-info">调试信息：已记录 ${this.completedNodes} 个完成节点，${this.decisions.length} 条决策</p>
                </div>
            `;
        }
        
        const nodeNames = {
            'node1': '节点1：情绪崩溃 - 接纳与专业界限',
            'node2': '节点2：基金会请求 - 诚实告知与最小伤害',
            'node3': '节点3：小明的疑问 - 知情权与渐进式告知',
            'node4': '节点4：父亲的请求 - 沟通媒介角色',
            'node6': '节点5：家庭会议 - 权利分配与共识达成'
        };
        
        return this.nodeResults.map((nr, idx) => {
            const nodeId = nr.nodeId || `unknown-${idx}`;
            const dimScores = Array.isArray(nr.dimensionScores) ? nr.dimensionScores : [];
            const strengths = Array.isArray(nr.strengths) ? nr.strengths : [];
            const concerns = Array.isArray(nr.concerns) ? nr.concerns : [];
            const reflectionQuestions = Array.isArray(nr.reflectionQuestions) ? nr.reflectionQuestions : [];
            const nodeTitle = nr.nodeTitle || nodeNames[nodeId] || `节点${idx + 1}`;
            const nodeRiskLevel = nr.nodeRiskLevel || 'medium';
            const nodeRawScore = typeof nr.nodeRawScore === 'number' ? nr.nodeRawScore : 0;
            
            console.log(`📋 Building accordion for ${nodeId}:`, { 
                dimScores: dimScores.length, 
                strengths: strengths.length, 
                concerns: concerns.length,
                hasPrimaryTendency: !!nr.primaryTendency
            });
            
            return `
                <details class="node-detail-item">
                    <summary class="node-detail-summary">
                        <span class="node-num">${idx + 1}</span>
                        <span class="node-title">${nodeTitle}</span>
                        <span class="node-risk risk-${nodeRiskLevel}">${nodeRiskLevel === 'high' ? '高风险' : nodeRiskLevel === 'medium' ? '中风险' : '低风险'}</span>
                        <span class="node-score">${nodeRawScore > 0 ? '+' : ''}${nodeRawScore}分</span>
                    </summary>
                    
                    <div class="node-detail-content">
                        ${dimScores.length > 0 ? `
                        <div class="detail-section">
                            <h4>📊 维度评分</h4>
                            <div class="mini-dimensions">
                                ${dimScores.map(ds => {
                                    const score = typeof ds.score === 'number' ? ds.score : 0;
                                    return `
                                        <div class="mini-dimension">
                                            <span class="mini-dim-name">${ds.dimensionName || ds.dimension || '未知维度'}</span>
                                            <span class="mini-dim-score" style="color: ${score >= 3 ? '#11998e' : score >= 2 ? '#667eea' : score >= 1 ? '#f59e0b' : '#ef4444'}">${score.toFixed(1)}分</span>
                                        </div>
                                        ${ds.behaviorEvidence ? `<p class="mini-evidence">"${this.escapeHtml(ds.behaviorEvidence)}"</p>` : ''}
                                        ${ds.reasoning ? `<p class="mini-reasoning"><em>${this.escapeHtml(ds.reasoning)}</em></p>` : ''}
                                    `;
                                }).join('')}
                            </div>
                        </div>` : '<div class="detail-section"><h4>📊 维度评分</h4><p class="no-data">暂无评分数据</p></div>'}
                        
                        ${strengths.length > 0 ? `
                        <div class="detail-section strengths">
                            <h4>✅ 做得好的地方</h4>
                            ${strengths.map(s => `
                                <div class="detail-card good">
                                    <p class="detail-quote">"${this.escapeHtml(s.quote || '暂无引用')}"</p>
                                    <p class="detail-principle"><em>${this.escapeHtml(s.principle || 'N/A')}</em></p>
                                    <p class="detail-explanation">${this.escapeHtml(s.explanation || '')}</p>
                                </div>
                            `).join('')}
                        </div>` : ''}
                        
                        ${concerns.length > 0 ? `
                        <div class="detail-section concerns">
                            <h4>⚠️ 需要反思的地方</h4>
                            ${concerns.map(c => `
                                <div class="detail-card bad">
                                    <p class="detail-quote">"${this.escapeHtml(c.quote || '暂无引用')}"</p>
                                    <p class="detail-violated"><strong>涉及原则：</strong>${this.escapeHtml(c.violatedPrinciple || 'N/A')}</p>
                                    <p class="detail-consequence"><strong>可能后果：</strong>${this.escapeHtml(c.consequence || '')}</p>
                                    ${c.betterResponse ? `<p class="detail-better"><strong>更佳回应：</strong>${this.escapeHtml(c.betterResponse)}</p>` : ''}
                                </div>
                            `).join('')}
                        </div>` : ''}
                        
                        ${reflectionQuestions.length > 0 ? `
                        <div class="detail-section reflection">
                            <h4>💭 本节点反思问题</h4>
                            <ul class="reflection-list">
                                ${reflectionQuestions.map(q => `<li>${this.escapeHtml(q)}</li>`).join('')}
                            </ul>
                        </div>` : ''}
                        
                        ${nr.ethicsAnalysis ? `
                        <div class="detail-section analysis">
                            <h4>📝 伦理分析</h4>
                            <p class="analysis-text">${this.escapeHtml(nr.ethicsAnalysis)}</p>
                        </div>` : ''}
                    </div>
                </details>
            `;
        }).join('');
    }

    buildOverallStatsHTML() {
        return '';
    }

    getScoreInterpretation(score) {
        if (score >= 80) {
            return '🌟 <strong>卓越表现！</strong>你在本次模拟中展现了出色的伦理敏感性和专业判断力。你的回应充分体现了对案主权益的尊重、对专业界限的把握，以及在复杂情境下的决策能力。继续保持这种反思性实践的习惯！';
        } else if (score >= 50) {
            return '👍 <strong>良好表现！</strong>你在大多数情况下做出了符合伦理规范的决策。你在共情能力、专业边界、诚实告知等方面都有不错的表现。建议在个别环节进一步加强反思，特别是在处理情绪强烈的情况时保持专业判断。';
        } else if (score >= 20) {
            return '✅ <strong>合格水平。</strong>你已经掌握了基本的伦理原则，但在实际应用中还有提升空间。特别需要注意：避免过度承诺、保持价值中立、在情感支持与专业判断之间找到平衡。多练习反思性实践会让你进步更快！';
        } else if (score >= 0) {
            return '⚠️ <strong>需要加强。</strong>你在本次模拟中遇到了一些伦理困境，这是学习的好机会。建议重点关注：如何在不伤害案主的前提下传递真实信息、如何在支持与引导之间找到平衡、以及如何管理自己的情绪以维持专业判断。';
        } else {
            return '❗ <strong>重要提醒。</strong>本次模拟中存在一些可能违背伦理原则的决策。请不要气馓——这正是模拟训练的价值所在！请仔细阅读下方的详细评估报告，理解每个决策的潜在影响。社会工作是一个需要持续学习和反思的职业。';
        }
    }

    buildEthicsEvaluationHTML() {
        if (this.decisions.length === 0) {
            return '';
        }

        let html = `
            <div class="ethics-evaluation-section">
                <h2>⚖️ 详细伦理评估报告</h2>
                <p class="ethics-intro">以下是对你在每个节点中具体话语的专业评价，请仔细阅读并进行反思。</p>
        `;

        this.decisions.forEach((decision, index) => {
            const analysis = decision.analysis;
            if (!analysis || analysis.primaryTendency === 'unknown' || analysis.primaryTendency === 'error') {
                return;
            }

            const hasGood = analysis.goodPractices && analysis.goodPractices.length > 0;
            const hasBad = analysis.badPractices && analysis.badPractices.length > 0;
            const hasReflection = analysis.reflectionQuestions && analysis.reflectionQuestions.length > 0;
            const riskLevel = analysis.riskLevel || 'medium';

            html += `
                <div class="ethics-node-card">
                    <div class="ethics-node-header">
                        <h3>📍 节点${index + 1}：${decision.nodeName}</h3>
                        <span class="ethics-tendency-tag ${this.getTendencyClass(decision.tendency)}">
                            倾向：${decision.tendencyName || '未识别'}
                        </span>
                        <span class="ethics-score-tag ${decision.ethicsScore >= 0 ? 'positive' : 'negative'}">
                            伦理评分：${decision.ethicsScore > 0 ? '+' : ''}${decision.ethicsScore}
                        </span>
                        <span class="risk-level-tag ${riskLevel}">
                            ${this.getRiskLevelTag(riskLevel)}
                        </span>
                    </div>

                    ${analysis.ethicsAnalysis ? `
                    <div class="ethics-overview">
                        <h4>📝 整体分析</h4>
                        <p>${analysis.ethicsAnalysis}</p>
                    </div>
                    ` : ''}

                    ${hasGood ? `
                    <div class="ethics-good">
                        <h4>✅ 做得好的地方</h4>
                        <ul>
                            ${analysis.goodPractices.map(practice => `<li>${practice}</li>`).join('')}
                        </ul>
                    </div>
                    ` : ''}

                    ${hasBad ? `
                    <div class="ethics-bad">
                        <h4>⚠️ 需要反思的地方</h4>
                        <ul>
                            ${analysis.badPractices.map(practice => `<li>${practice}</li>`).join('')}
                        </ul>
                    </div>
                    ` : ''}

                    ${analysis.recommendations && analysis.recommendations.length > 0 ? `
                    <div class="ethics-recommendations">
                        <h4>💡 专业建议</h4>
                        <ol>
                            ${analysis.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                        </ol>
                    </div>
                    ` : ''}

                    ${hasReflection ? `
                    <div class="ethics-reflection">
                        <h4>🤔 请思考以下问题</h4>
                        <div class="reflection-questions">
                            ${analysis.reflectionQuestions.map(q => `<div class="reflection-q">• ${q}</div>`).join('')}
                        </div>
                    </div>
                    ` : ''}
                </div>
            `;
        });

        html += `
            </div>
            <div class="ethics-final-note">
                <p><strong>💭 教学提示：</strong>社会工作没有标准答案，但每一次对话都是学习的机会。以上评价旨在帮助你反思自己的专业实践，而非对你的人格评判。请在未来的工作中持续学习和成长！</p>
            </div>
        `;

        return html;
    }

    getTendencyClass(tendency) {
        const map = {
            'emotional_response': 'tendency-emotional',
            'professional_boundary': 'tendency-professional',
            'honest_communication': 'tendency-honest',
            'client_self_determination': 'tendency-self-determination',
            'mediation': 'tendency-mediation',
            'empowerment': 'tendency-empowerment'
        };
        return map[tendency] || 'tendency-default';
    }

    getRiskLevelTag(level) {
        const map = {
            'low': '🟢 低风险',
            'medium': '🟡 中等风险',
            'high': '🔴 高风险'
        };
        return map[level] || '🟡 中等风险';
    }

    formatMarkdown(text) {
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>')
            .replace(/^/, '<p>')
            .replace(/$/, '</p>');
    }

    restart() {
        this.saveUserInfo();
        this.clearSavedProgress();
        
        this.currentNode = 'intro';
        this.currentNodeRounds = 0;
        this.userMessages = [];
        this.decisions = [];
        this.ethicsScore = 0;
        this.completedNodes = 0;
        this.isProcessing = false;
        this.nodeResults = [];
        this.overallAssessment = null;
        this.api.resetConversation();

        document.getElementById('chat-messages').innerHTML = '';
        document.getElementById('message-log').innerHTML = '<p class="empty-log">暂无消息</p>';
        const completedNodesEl = document.getElementById('completed-nodes');
        if (completedNodesEl) {
            completedNodesEl.textContent = '0/5';
        }

        showPage('info-page');
        
        const form = document.getElementById('info-form');
        if (form) form.reset();
        this.userInfo = null;
        localStorage.removeItem('currentUserInfo');
    }

    async addMessage(message) {
        const messagesContainer = document.getElementById('chat-messages');
        const messageDiv = this.createMessageElement(message);
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        this.updateMessageLog(message);
    }

    async typeMessageWithPreload(message, preloadFn, options = {}) {
        this.isTyping = true;
        
        const messagesContainer = document.getElementById('chat-messages');
        
        const div = document.createElement('div');
        div.className = `message ${message.type} message-typing`;
        
        const avatar = this.getAvatar(message.type, message.sender);
        const time = this.formatTime(message.timestamp);
        
        div.innerHTML = `
            <div class="message-avatar">${avatar}</div>
            <div class="message-content">
                <div class="message-sender">${message.sender}</div>
                <div class="message-text"><span class="typewriter-text"></span><span class="typewriter-cursor">|</span></div>
                <div class="message-time">${time}</div>
            </div>
        `;
        
        messagesContainer.appendChild(div);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        this.updateMessageLog(message);

        const textSpan = div.querySelector('.typewriter-text');
        const cursorSpan = div.querySelector('.typewriter-cursor');
        const fullText = message.content;
        
        const preloadPromise = preloadFn ? preloadFn() : Promise.resolve(null);
        
        let i = 0;
        const isSystem = message.type === 'system';
        const baseSpeed = options.speed || (isSystem ? 18 : 35);
        const punctuationPause = isSystem ? 60 : 120;
        const endPause = isSystem ? 80 : 200;
        
        while (i < fullText.length) {
            if (!this.isTyping) {
                textSpan.textContent = fullText;
                break;
            }
            
            const char = fullText[i];
            textSpan.textContent += char;
            
            let wait = baseSpeed;
            if ('，。！？；：、…—》」』'.includes(char)) {
                wait = punctuationPause;
            } else if (char === '\n') {
                wait = endPause;
            }
            
            i++;
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            
            await new Promise(r => setTimeout(r, wait));
        }

        cursorSpan.style.display = 'none';
        div.classList.remove('message-typing');
        this.isTyping = false;
        
        const preloadResult = await preloadPromise;
        
        return preloadResult;
    }

    skipTyping() {
        this.isTyping = false;
    }

    toggleSidebar() {
        const panel = document.querySelector('.status-panel');
        const toggle = document.getElementById('sidebar-toggle');
        const overlay = document.getElementById('sidebar-overlay');

        if (!panel) return;

        const isVisible = panel.classList.contains('sidebar-visible');

        if (isVisible) {
            panel.classList.remove('sidebar-visible');
            toggle?.classList.remove('hidden');
            overlay?.classList.remove('visible');
        } else {
            panel.classList.add('sidebar-visible');
            toggle?.classList.add('hidden');
            overlay?.classList.add('visible');
        }
    }

    initMobileSidebar() {
        if (window.innerWidth > 768) return;

        const toggle = document.getElementById('sidebar-toggle');
        toggle?.classList.remove('hidden');

        const chatArea = document.querySelector('.chat-area');
        if (!chatArea) return;

        chatArea.classList.add('swipe-hint');

        let touchStartX = 0;
        let touchStartY = 0;
        let isSwiping = false;

        chatArea.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            isSwiping = true;
        }, { passive: true });

        chatArea.addEventListener('touchmove', (e) => {
            if (!isSwiping) return;

            const deltaX = e.touches[0].clientX - touchStartX;
            const deltaY = Math.abs(e.touches[0].clientY - touchStartY);

            if (deltaX > 50 && deltaY < 30) {
                this.toggleSidebar();
                chatArea.classList.add('swipe-dismissed');
                isSwiping = false;
            }
        }, { passive: true });

        chatArea.addEventListener('touchend', () => {
            isSwiping = false;
        }, { passive: true });
    }

    createMessageElement(message) {
        const div = document.createElement('div');
        div.className = `message ${message.type}`;

        const avatar = this.getAvatar(message.type, message.sender);
        const time = this.formatTime(message.timestamp);
        const displayContent = (message.type === 'npc' || message.type === 'npc-character') ? this.removeActionPrompts(message.content) : message.content;

        div.innerHTML = `
            <div class="message-avatar">${avatar}</div>
            <div class="message-content">
                <div class="message-sender">${message.sender}</div>
                <div class="message-text">${displayContent}</div>
                <div class="message-time">${time}</div>
            </div>
        `;

        return div;
    }

    getAvatar(type, sender) {
        if (type === 'system') return '📋';
        if (type === 'user') return '👩‍💼';
        
        const character = Object.values(CHARACTER_PROFILES).find(c => c.name === sender);
        return character ? character.avatar : '👤';
    }

    formatTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    updateMessageLog(message) {
        const logContainer = document.getElementById('message-log');
        const emptyLog = logContainer.querySelector('.empty-log');
        if (emptyLog) {
            emptyLog.remove();
        }

        const logItem = document.createElement('div');
        logItem.className = 'log-item';
        logItem.innerHTML = `
            <span class="log-sender">${message.sender}:</span>
            <span class="log-content">${this.truncateText(message.content, 50)}</span>
        `;
        logContainer.appendChild(logItem);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    truncateText(text, maxLength) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    removeActionPrompts(text) {
        if (!text || typeof text !== 'string') return text;

        let cleaned = text;

        cleaned = cleaned.replace(/[（(][^）)]*动作提示[：:][^）)]*[）)]/g, '');
        cleaned = cleaned.replace(/[（(][^）)]*[动作|神态|表情|语气|姿态][^）)]*[）)]/g, '');

        const actionPatterns = [
            /[（(][^）]{0,30}(?:沉默|颤抖|低头|叹气|擦泪|握住|转身|点头|摇头|停顿|深呼吸|犹豫|紧握|松开|移开|看向|注视|微笑|皱眉|咬唇)[^）]{0,20}[）)]/g,
            /(?:长久地|轻轻地|慢慢地|突然|猛地|缓缓|微微|轻轻)[^。]{0,40}(?:沉默|颤抖|低头|叹气|擦泪|转身|点头|摇头)/g
        ];

        for (const pattern of actionPatterns) {
            cleaned = cleaned.replace(pattern, '');
        }

        cleaned = cleaned.replace(/\s*[（(]\s*[）)]\s*/g, '');
        cleaned = cleaned.replace(/["""]([^"""]*)["""]/g, '$1');
        cleaned = cleaned.replace(/\s{2,}/g, ' ');
        cleaned = cleaned.trim();

        return cleaned || text;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    updateScenarioDisplay(nodeData) {
        const scenarioBox = document.getElementById('scenario-box');
        scenarioBox.innerHTML = `
            <h4>${nodeData.name}</h4>
            <p class="description">${nodeData.description}</p>
        `;
    }

    updateNodeIndicator(nodeName) {
        document.getElementById('current-node-name').textContent = nodeName;
    }

    updateProgressInfo(nodeData) {
        const minRounds = nodeData.minRounds || 2;
        const maxRounds = nodeData.maxRounds || 4;
        
        const progressBox = document.getElementById('progress-info');
        progressBox.innerHTML = `
            <div class="rounds-info">
                <strong>当前轮次：</strong>0 / ${minRounds}-${maxRounds}
            </div>
            <div class="progress-hint">
                请与角色进行自然对话...
            </div>
        `;
    }

    updateRoundDisplay() {
        const nodeData = CASE_NODES[this.currentNode];
        const minRounds = nodeData.minRounds || 2;
        const maxRounds = nodeData.maxRounds || 4;
        
        const progressBox = document.getElementById('progress-info');
        if (progressBox) {
            progressBox.innerHTML = `
                <div class="rounds-info">
                    <strong>当前轮次：</strong>${this.currentNodeRounds} / ${minRounds}-${maxRounds}
                </div>
                <div class="progress-hint">
                    ${this.currentNodeRounds < minRounds ? 
                        '继续深入对话...' : 
                        this.currentNodeRounds >= maxRounds ?
                            '即将进入下一阶段...' :
                            '可以尝试引导话题...'}
                </div>
            `;
        }
    }

    updateDecisionStats() {
        const el = document.getElementById('completed-nodes');
        if (el) {
            el.textContent = `${this.completedNodes}/5`;
        }
    }

    updateUI() {
        this.updateDecisionStats();
    }

    enableInput() {
        document.getElementById('user-input').disabled = false;
        document.getElementById('send-btn').disabled = false;
        document.getElementById('user-input').focus();
        this.updateRoundDisplay();
    }

    disableInput() {
        document.getElementById('user-input').disabled = true;
        document.getElementById('send-btn').disabled = true;
    }

    async addTypingIndicator() {
        const messagesContainer = document.getElementById('chat-messages');
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message npc typing-message';
        typingDiv.id = 'typing-indicator';
        typingDiv.innerHTML = `
            <div class="message-avatar">👤</div>
            <div class="message-content">
                <div class="message-sender">正在输入...</div>
                <div class="message-text">
                    <span class="loading"></span>
                </div>
            </div>
        `;
        messagesContainer.appendChild(typingDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    removeTypingIndicator() {
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getLastTendency(nodeId) {
        const decision = this.decisions.find(d => d.nodeId === nodeId);
        return decision ? decision.tendency : null;
    }

    detectCriticalEthicalQuestion(userMessage) {
        const criticalPatterns = [
            /是不是.*(?:死了|治不好|快不行了|没救了|快走了)/,
            /能不能.*(?:告诉我|说|讲).*(?:真相|实话|真实情况)/,
            /我会*(?:怎么样|如何|还有多久|什么时候)/,
            /(?:死|去世|离开|走).*\?/,
            /还能.*(?:活多久|活多长|撑多久)/,
            /是不是.*(?:癌症|肿瘤|病).*(?:严重|晚期|没办法)/,
            /医生.*(?:怎么说|怎么讲|什么意思)/,
            /我不想.*(?:死|走|离开|痛苦)/,
            /怕.*(?:死|痛|离开|看不到)/,
            /回家.*(?:是什么意思|是不是|难道)/,
            /真相|实话|隐瞒|欺骗/
        ];

        const msg = userMessage || '';
        return criticalPatterns.some(pattern => pattern.test(msg));
    }

    splitMultiCharacterMessage(content, nodeData) {
        const messages = [];
        
        if (!content || typeof content !== 'string' || content.trim().length === 0) {
            return [{
                type: 'npc',
                sender: this.getNPCName(nodeData),
                content: content || '',
                timestamp: new Date()
            }];
        }

        console.log('🔍 开始拆分多角色消息，原始内容前200字:', content.substring(0, 200));

        const switchPattern = /【切换到[：:]\s*([^】]+)】/g;
        const parts = [];
        let lastIndex = 0;
        let match;
        let currentSender = this.getNPCName(nodeData);
        let foundSwitch = false;

        while ((match = switchPattern.exec(content)) !== null) {
            foundSwitch = true;
            
            const beforeText = content.substring(lastIndex, match.index).trim();
            if (beforeText) {
                parts.push({
                    text: beforeText,
                    sender: currentSender
                });
            }
            
            currentSender = this.resolveCharacterName(match[1].trim());
            
            lastIndex = match.index + match[0].length;
        }

        if (foundSwitch) {
            const remainingText = content.substring(lastIndex).trim();
            if (remainingText) {
                parts.push({
                    text: remainingText,
                    sender: currentSender
                });
            }

            parts.forEach(part => {
                if (part.text && part.text.trim()) {
                    messages.push(this.createCharacterMessage(part.sender, part.text.trim()));
                }
            });

            if (messages.length === 0) {
                messages.push(this.createCharacterMessage(this.getNPCName(nodeData), content));
            }

            console.log('✅ 【切换到】标记拆分成功:', messages.map(m => `${m.sender}: ${m.content.substring(0, 30)}...`));
            
            this.validateAndCorrectRoles(messages);
            
            return messages;
        }

        console.log('🔍 未找到【切换到】标记，尝试语义分析...');
        
        const semanticParts = this.detectSemanticSpeakers(content, nodeData);
        
        if (semanticParts.length > 1) {
            semanticParts.forEach(part => {
                messages.push(this.createCharacterMessage(part.sender, part.text.trim()));
            });
            
            console.log('✅ 语义拆分成功，共', messages.length, '个气泡');
            
            this.validateAndCorrectRoles(messages);
            
            return messages;
        }

        console.log('⚠️ 未检测到多角色，返回单一消息（默认角色）');
        return [this.createCharacterMessage(this.getNPCName(nodeData), content)];
    }
    
    validateAndCorrectRoles(messages) {
        if (!messages || messages.length === 0) return;
        
        console.log('\n🔍 开始角色归属后处理校验...');
        
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            const detectedSpeaker = this.guessSpeakerFromContent(msg.content, msg.sender);
            
            if (detectedSpeaker && detectedSpeaker !== msg.sender) {
                console.warn(`\n⚠️ 角色归属不一致检测到！`);
                console.warn(`   消息 #${i + 1}:`);
                console.warn(`   原始发送者：${msg.sender}`);
                console.warn(`   检测到的正确角色：${detectedSpeaker}`);
                console.warn(`   内容摘要：${msg.content.substring(0, 80)}...`);
                
                const correction = this.shouldCorrectRoleAssignment(msg.sender, detectedSpeaker, msg.content);
                
                if (correction.shouldCorrect) {
                    console.warn(`🔧 自动修正：${correction.reason}`);
                    msg.sender = detectedSpeaker;
                    msg.type = detectedSpeaker.includes('刘雪梅') ? 'npc' : 'npc-character';
                } else {
                    console.log(`✅ 保持原始分配：${correction.reason}`);
                }
            } else {
                console.log(`✅ 消息 #${i + 1}: 角色归属一致 (${msg.sender})`);
            }
        }
        
        console.log('🎭 角色校验完成\n');
    }
    
    shouldCorrectRoleAssignment(originalSender, detectedSender, content) {
        const xiaomingIndicators = [/我才\d+岁/, /我想回家/, /姐姐你知道吗/, /我不怕痛/, /我很痛/];
        const motherIndicators = [/我的孩子/, /他才\d+岁/, /我不能接受/, /你们要.*?放弃/];
        
        const isStrongXiaoming = xiaomingIndicators.some(p => p.test(content));
        const isStrongMother = motherIndicators.some(p => p.test(content));
        
        if (isStrongXiaoming && detectedSender.includes('小明')) {
            return { shouldCorrect: true, reason: '强烈的小明第一人称特征匹配' };
        }
        
        if (isStrongMother && detectedSender.includes('母亲')) {
            return { shouldCorrect: true, reason: '强烈的母亲第三人称特征匹配' };
        }
        
        if (originalSender === detectedSender) {
            return { shouldCorrect: false, reason: '检测结果与原分配一致' };
        }
        
        return { shouldCorrect: false, reason: '特征不够明确，保持原分配以避免误判' };
    }

    resolveCharacterName(rawName) {
        const name = rawName.trim();
        
        if (name.includes('陈国强') || name.includes('国强') || name.includes('爸爸') || name.includes('父亲')) {
            return '👨 陈国强（父亲）';
        }
        if (name.includes('小明') || name.includes('孩子') || name.includes('儿子')) {
            return '👦 小明（患儿）';
        }
        if (name.includes('刘雪梅') || name.includes('雪梅') || name.includes('妈妈') || name.includes('母亲')) {
            return '👩 刘雪梅（母亲）';
        }
        
        return `🎭 ${name}`;
    }

    detectSemanticSpeakers(content, nodeData) {
        const parts = [];
        const defaultSender = this.getNPCName(nodeData);

        const chenguoqiangIndicators = [
            /孩子他妈[^。！？]*[""「]([^""」]{5,})[""」]/gi,
            /(?:陈国强|爸爸|父亲|国强)[：:\s][""「]([^""」]{5,})[""」]/gi,
            /(?:^|\n)[\s]*[（(][^）)]*?(?:陈国强|爸爸|父亲|国强)[^）)]*?[）][\s\S]*?[""「][^""】]*[""」]/gi
        ];

        const xiaomingIndicators = [
            /(?:我怕|我不想|我想|姐姐|怕痛|不想.*妈妈.*哭|希望|画)[：:\s][""「]([^""】]{5,})[""」]/gi,
            /(?:^|\n)[\s]*[（(][^）)]*?小明[^）)]*?[）][\s\S]*?[""「][^""】]*[""」]/gi,
            /小明[：:\s][""「]([^""】]{5,})[""」]/gi
        ];

        let lastEndIndex = 0;

        for (const pattern of chenguoqiangIndicators) {
            pattern.lastIndex = 0;
            let match;
            
            while ((match = pattern.exec(content)) !== null) {
                const matchedText = match[0];
                const matchStart = match.index;
                
                if (matchStart > lastEndIndex + 3) {
                    const betweenText = content.substring(lastEndIndex, matchStart).trim();
                    if (betweenText.length > 8) {
                        parts.push({ 
                            text: betweenText, 
                            sender: this.guessSpeakerFromContent(betweenText, defaultSender) 
                        });
                    }
                }

                const cleanText = this.extractQuotedText(matchedText);
                if (cleanText && cleanText.length > 2) {
                    parts.push({ text: cleanText, sender: '👨 陈国强（父亲）' });
                } else if (matchedText.length > 10) {
                    parts.push({ text: matchedText.trim(), sender: '👨 陈国强（父亲）' });
                }
                
                lastEndIndex = Math.max(lastEndIndex, matchStart + matchedText.length);
            }
        }

        for (const pattern of xiaomingIndicators) {
            pattern.lastIndex = 0;
            let match;
            
            while ((match = pattern.exec(content)) !== null) {
                const matchedText = match[0];
                const matchStart = match.index;
                
                if (matchStart >= lastEndIndex && (matchStart - lastEndIndex) > 3) {
                    const betweenText = content.substring(lastEndIndex, matchStart).trim();
                    if (betweenText.length > 8) {
                        const speaker = this.guessSpeakerFromContent(betweenText, defaultSender);
                        if (speaker !== '👦 小明（患儿）') {
                            parts.push({ text: betweenText, sender: speaker });
                        }
                    }
                }

                const cleanText = this.extractQuotedText(matchedText);
                if (cleanText && cleanText.length > 2) {
                    parts.push({ text: cleanText, sender: '👦 小明（患儿）' });
                } else if (matchedText.length > 10) {
                    parts.push({ text: matchedText.trim(), sender: '👦 小明（患儿）' });
                }
                
                lastEndIndex = Math.max(lastEndIndex, matchStart + matchedText.length);
            }
        }

        if (lastEndIndex < content.length - 5) {
            const finalText = content.substring(lastEndIndex).trim();
            if (finalText.length > 5) {
                parts.push({ 
                    text: finalText, 
                    sender: this.guessSpeakerFromContent(finalText, defaultSender) 
                });
            }
        }

        if (parts.length <= 1) {
            return [{ text: content, sender: defaultSender }];
        }

        return parts;
    }

    guessSpeakerFromContent(text, defaultSender) {
        if (!text || text.length < 3) return defaultSender;

        const cleanedText = text.replace(/[（(][^）)]*[）)]/g, '').trim();
        
        const firstPersonPatterns = {
            xiaoming: {
                patterns: [/我才\d+岁/, /我想回家/, /姐姐你知道吗/, /我不怕痛/, /我只是不想/, /我想吃/, /我想画/, /我看出来了/, /我不想治了/, /我很痛/, /我怕/, /妈妈.*?(?:哭|说|想)/, /家里.*?(?:狗|画)/],
                weight: 10,
                description: '小明第一人称特征'
            },
            mother: {
                patterns: [/我的孩子/, /他才\d+岁/, /我儿子/, /我不能接受/, /你们要.*?(?:放弃|怎么)/, /孩子他妈/, /我怎么.*?(?:能|可以)/, /作为母亲/, /我照顾/, /我也好怕/, /我不想让他/],
                weight: 10,
                description: '母亲第一人称特征'
            },
            father: {
                patterns: [/我作为爸爸/, /孩子他妈.*?你/, /让我想想/, /这事真的/, /我是.*?爸爸/],
                weight: 8,
                description: '父亲第一人称特征'
            }
        };

        let scores = { xiaoming: 0, mother: 0, father: 0 };
        
        for (const [role, config] of Object.entries(firstPersonPatterns)) {
            for (const pattern of config.patterns) {
                if (pattern.test(cleanedText)) {
                    scores[role] += config.weight;
                    console.log(`🎭 角色检测：匹配到${config.description} (+${config.weight}分)`);
                }
            }
        }

        const thirdPersonContext = {
            motherReferringToChild: [/他才会/, /这孩子/, /小明他/, /我儿子他/, /小孩子.*?怎么/],
            childReferringToMom: [/妈妈她/, /她说/, /妈妈不让我/],
            fatherReferringToWife: [/雪梅她/, /孩子他妈她/, /你老婆/]
        };

        if (thirdPersonContext.motherReferringToChild.some(p => p.test(cleanedText))) {
            scores.mother += 8;
            console.log('🎭 角色检测：母亲指代孩子（第三人称）(+8分)');
        }

        if (thirdPersonContext.childReferringToMom.some(p => p.test(cleanedText))) {
            scores.xiaoming += 8;
            console.log('🎭 角色检测：孩子指代妈妈（第三人称）(+8分)');
        }

        if (thirdPersonContext.fatherReferringToWife.some(p => p.test(cleanedText))) {
            scores.father += 8;
            console.log('🎭 角色检测：父亲指代妻子（第三人称）(+8分)');
        }

        const actionTagMatch = text.match(/[（(]([^）)]+?)[）)]/);
        let actionSubject = null;
        
        if (actionTagMatch && actionTagMatch[1]) {
            const actionText = actionTagMatch[1];
            
            if (/小明|孩子|男孩|弟弟|他\s*(?:低头|看|画|说|想|问)/.test(actionText)) {
                actionSubject = 'xiaoming';
                console.log(`🎭 动作标签检测：动作主体是小明 - "${actionText}"`);
            } else if (/刘雪梅|母亲|雪梅|她\s*(?:擦|哭|握|站|说|喊)/.test(actionText)) {
                actionSubject = 'mother';
                console.log(`🎭 动作标签检测：动作主体是母亲 - "${actionText}"`);
            } else if (/陈国强|父亲|国强|他\s*(?:沉默|抽烟|叹气|低|说)/.test(actionText)) {
                actionSubject = 'father';
                console.log(`🎭 动作标签检测：动作主体是父亲 - "${actionText}"`);
            }
            
            if (actionSubject) {
                scores[actionSubject] += 5;
                
                const conflictRoles = Object.keys(scores).filter(r => r !== actionSubject && scores[r] > 5);
                if (conflictRoles.length > 0) {
                    console.warn(`⚠️ 角色冲突检测：动作标签显示${actionSubject}，但文本匹配${conflictRoles.join(',')}`);
                    
                    if (actionSubject === 'xiaoming' && scores.mother > 15) {
                        console.warn('🔧 自动修正：动作标签显示小明，但内容明显是母亲的 → 归属给母亲');
                        scores.mother += 3;
                        scores.xiaoming -= 2;
                    } else if (actionSubject === 'mother' && scores.xiaoming > 15) {
                        console.warn('🔧 自动修正：动作标签显示母亲，但内容明显是小明的 → 归属给小明');
                        scores.xiaoming += 3;
                        scores.mother -= 2;
                    }
                }
            }
        }

        const emotionalMarkers = {
            mother: [/崩溃/, /不能接受/, /绝对不/, /怎么可以/, /放弃.*?不行/, /眼泪/, /颤抖/, /哭/],
            father: [/沉默/, /沙哑/, /叹气/, /抽烟/, /低声/, /慢慢地说/],
            xiaoming: [/轻声/, /小声/, /抬头看/, /低下头/, /画画/]
        };

        for (const [role, markers] of Object.entries(emotionalMarkers)) {
            for (const marker of markers) {
                if (marker.test(text)) {
                    scores[role] += 3;
                    break;
                }
            }
        }

        console.log(`📊 角色评分结果：`, scores);

        const maxScore = Math.max(...Object.values(scores));
        if (maxScore >= 8) {
            const winner = Object.keys(scores).find(role => scores[role] === maxScore);
            
            switch(winner) {
                case 'xiaoming':
                    console.log(`✅ 判定为：小明（得分：${scores.xiaoming}）`);
                    return '👦 小明（患儿）';
                case 'mother':
                    console.log(`✅ 判定为：刘雪梅（得分：${scores.mother}）`);
                    return '👩 刘雪梅（母亲）';
                case 'father':
                    console.log(`✅ 判定为：陈国强（得分：${scores.father}）`);
                    return '👨 陈国强（父亲）';
            }
        }

        console.log(`⚠️ 无法确定角色，使用默认发送者：${defaultSender}`);
        return defaultSender;
    }

    extractQuotedText(rawText) {
        if (!rawText) return '';

        const quoteMatch = rawText.match(/[""「]([^""」]+)[""」]/);
        if (quoteMatch && quoteMatch[1]) {
            return quoteMatch[1].trim();
        }

        const parenMatch = rawText.match(/[）)]\s*[：:?\s]*([^\n（]{5,})/);
        if (parenMatch && parenMatch[1]) {
            return parenMatch[1].trim();
        }

        return rawText.replace(/^[（(][^）)]*?[）)][\s]*/, '').trim();
    }

    createCharacterMessage(sender, content) {
        const normalizedSender = this.normalizeSenderTag(sender, content);
        
        const roleName = this.extractRoleName(normalizedSender);
        
        if (roleName && content && !content.includes('【切换到') && !content.startsWith('<strong>')) {
            this.addToDialoguePool(roleName, content);
        }
        
        return {
            type: normalizedSender === '👩 刘雪梅（母亲）' ? 'npc' : 'npc-character',
            sender: normalizedSender,
            content: content,
            timestamp: new Date(),
            nodeId: this.currentNode
        };
    }
    
    extractRoleName(sender) {
        if (!sender) return null;
        
        if (sender.includes('刘雪梅')) return '刘雪梅（母亲）';
        if (sender.includes('小明')) return '小明（患儿）';
        if (sender.includes('陈国强')) return '陈国强（父亲）';
        if (sender.includes('系统') || sender.includes('环境')) return null;
        
        return sender;
    }
    
    addToDialoguePool(roleName, content) {
        if (!roleName || !content) return;
        
        const cleanContent = this.removeActionPrompts(content).trim();
        
        if (!cleanContent || cleanContent.length < 2) return;
        
        const timestamp = new Date().toLocaleTimeString('zh-CN', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        const dialogueEntry = `[${timestamp}] ${roleName}：${cleanContent}\n`;
        
        this.nodeDialoguePool += dialogueEntry;
        
        console.log(`📝 对话池追加：${dialogueEntry.substring(0, 80)}...`);
    }

    normalizeSenderTag(sender, content) {
        const validSenders = {
            '👩 刘雪梅（母亲）': '👩 刘雪梅（母亲）',
            '👨 陈国强（父亲）': '👨 陈国强（父亲）',
            '👦 小明（患儿）': '👦 小明（患儿）'
        };

        if (validSenders[sender]) {
            return sender;
        }

        if (sender.includes('刘雪梅') || sender.includes('妈妈') || sender.includes('母亲')) {
            return '👩 刘雪梅（母亲）';
        }
        if (sender.includes('陈国强') || sender.includes('爸爸') || sender.includes('父亲')) {
            return '👨 陈国强（父亲）';
        }
        if (sender.includes('小明') || sender.includes('孩子') || sender.includes('儿子')) {
            return '👦 小明（患儿）';
        }

        if (content && content.length > 3) {
            if (/孩子他妈|雪梅你/.test(content)) return '👨 陈国强（父亲）';
            if (/我怕|姐姐|不想|希望/.test(content)) return '👦 小明（患儿）';
        }

        return '👩 刘雪梅（母亲）';
    }

    formatDateForFile(date) {
        return date.toISOString().slice(0, 19)
            .replace(/[:-]/g, '')
            .replace('T', '_');
    }

    showGeneratingOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'pdf-generating-overlay';
        overlay.id = 'pdf-generating-overlay';
        overlay.innerHTML = `
            <div class="pdf-generating-content">
                <div class="spinner"></div>
                <h3>正在生成总结报告...</h3>
                <p style="color: #666; margin-top: 10px;">请稍候，正在整理评估数据</p>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    hideGeneratingOverlay() {
        const overlay = document.getElementById('pdf-generating-overlay');
        if (overlay) {
            overlay.remove();
        }
    }

    getSenderFromContent(content) {
        if (content.includes('刘雪梅')) return '刘雪梅';
        if (content.includes('小明')) return '小明';
        if (content.includes('陈国强')) return '陈国强';
        if (content.includes('环境') || content.includes('【')) return '环境';
        return '角色';
    }

    detectMessageType(msg) {
        const content = msg.content || '';
        const sender = msg.sender || '';
        const type = msg.type || '';

        if (type === 'system') {
            if (sender === '场景过渡' || sender === '🎓 督导反馈' || sender.includes('督导')) {
                return {
                    name: sender || '系统提示',
                    icon: '📍',
                    textColor: [156, 39, 176],
                    bgColor: [243, 229, 245],
                    contentColor: [106, 27, 154],
                    isSystem: true,
                    isEnvironment: false,
                    isUser: false
                };
            }
            
            if (sender === '环境' || content.includes('【')) {
                return {
                    name: '🎬 场景描述',
                    icon: '🎬',
                    textColor: [0, 105, 92],
                    bgColor: [224, 242, 241],
                    contentColor: [0, 77, 64],
                    isSystem: true,
                    isEnvironment: true,
                    isUser: false
                };
            }
            
            if (sender === '🤖 AI分析' || sender.includes('分析') || sender.includes('评估')) {
                return {
                    name: sender || 'AI分析',
                    icon: '🤖',
                    textColor: [123, 31, 162],
                    bgColor: [237, 231, 246],
                    contentColor: [74, 20, 140],
                    isSystem: true,
                    isEnvironment: false,
                    isUser: false
                };
            }
            
            return {
                name: sender || '系统',
                icon: '⚙️',
                textColor: [100, 100, 100],
                bgColor: [245, 245, 245],
                contentColor: [80, 80, 80],
                isSystem: true,
                isEnvironment: false,
                isUser: false
            };
        }

        if (type === 'user') {
            return {
                name: '👩‍⚕️ 社工小李',
                icon: '👩‍⚕️',
                textColor: [46, 125, 50],
                bgColor: [232, 245, 233],
                contentColor: [27, 94, 32],
                isSystem: false,
                isEnvironment: false,
                isUser: true
            };
        }

        if (content.includes('刘雪梅') || sender === '刘雪梅') {
            return {
                name: '👩 刘雪梅（母亲）',
                icon: '👩',
                textColor: [198, 40, 40],
                bgColor: [255, 235, 238],
                contentColor: [183, 28, 28],
                isSystem: false,
                isEnvironment: false,
                isUser: false
            };
        }

        if (content.includes('小明') || sender === '小明' || sender === '👦 小明（患儿）') {
            return {
                name: '👦 小明（患儿）',
                icon: '👦',
                textColor: [21, 101, 192],
                bgColor: [227, 242, 253],
                contentColor: [13, 71, 161],
                isSystem: false,
                isEnvironment: false,
                isUser: false
            };
        }

        if (content.includes('陈国强') || sender === '陈国强' || sender === '👨 陈国强（父亲）') {
            return {
                name: '👨 陈国强（父亲）',
                icon: '👨',
                textColor: [87, 96, 111],
                bgColor: [236, 239, 241],
                contentColor: [55, 71, 79],
                isSystem: false,
                isEnvironment: false,
                isUser: false
            };
        }

        if (sender === '环境' || content.includes('【') || content.includes('场景')) {
            return {
                name: '🎬 场景环境',
                icon: '🎬',
                textColor: [0, 105, 92],
                bgColor: [224, 242, 241],
                contentColor: [0, 77, 64],
                isSystem: false,
                isEnvironment: true,
                isUser: false
            };
        }

        return {
            name: sender || '🎭 角色',
            icon: sender && sender.includes('🎭') ? '🎭' : '🎭',
            textColor: [100, 100, 100],
            bgColor: [250, 250, 250],
            contentColor: [66, 66, 66],
            isSystem: false,
            isEnvironment: false,
            isUser: false
        };
    }
}

let simulator;

document.addEventListener('DOMContentLoaded', () => {
    simulator = new CaseSimulator();
});

function showPage(pageId) {
    const pages = document.querySelectorAll('.page');
    if (pages.length === 0) {
        console.warn('⚠️ showPage: 未找到任何 .page 元素');
        return;
    }

    pages.forEach(page => {
        if (page && page.classList) {
            page.classList.remove('active');
        }
    });

    const targetPage = document.getElementById(pageId);
    if (targetPage && targetPage.classList) {
        targetPage.classList.add('active');
        window.scrollTo(0, 0);
    } else {
        console.warn(`⚠️ showPage: 未找到目标页面 #${pageId}`);
    }
}

