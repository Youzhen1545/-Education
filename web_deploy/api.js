const DEEPSEEK_API_CONFIG = {
    apiKey: 'sk-fed3f144290246aaa2af39bff05c755f',
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',
    timeout: 30000
};

class DeepSeekAPI {
    constructor() {
        this.config = DEEPSEEK_API_CONFIG;
    }

    async sendMessage(messages, options = {}, retryCount = 0) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout || 30000);

        try {
            const response = await fetch(this.config.baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
                body: JSON.stringify({
                    model: this.config.model,
                    messages: messages,
                    temperature: options.temperature || 0.8,
                    max_tokens: options.maxTokens || 2000
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorBody = await response.text().catch(() => '');
                throw new APIError(
                    `API请求失败(${response.status})`,
                    'API_ERROR',
                    { status: response.status, body: errorBody }
                );
            }

            const data = await response.json();
            
            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                throw new APIError('API返回数据格式异常', 'PARSE_ERROR', data);
            }
            
            return data.choices[0].message.content;
        } catch (error) {
            clearTimeout(timeoutId);

            if (error.name === 'AbortError') {
                console.error('API请求超时:', error);
                throw new APIError('请求超时，请检查网络后重试', 'TIMEOUT', { retryCount });
            }

            if (error instanceof TypeError && error.message.includes('fetch')) {
                console.error('网络连接失败:', error);
                throw new APIError('网络连接失败，请检查网络', 'NETWORK_ERROR', error);
            }

            if (error instanceof APIError) {
                throw error;
            }

            console.error('DeepSeek API错误:', error);

            if (retryCount < 2) {
                console.log(`正在重试... (${retryCount + 1}/3)`);
                await this.delay(1000 * (retryCount + 1));
                return this.sendMessage(messages, options, retryCount + 1);
            }
            
            throw new APIError(`服务暂时不可用: ${error.message}`, 'UNKNOWN_ERROR', error);
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

class APIError extends Error {
    constructor(message, code, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'APIError';
    }
}

class CaseSimulationAPI {
    constructor() {
        this.deepseek = new DeepSeekAPI();
        this.conversationHistory = [];
    }

    getStandardDialogue(currentNode) {
        const nodeData = CASE_NODES[currentNode];
        if (nodeData && nodeData.standardDialogue) {
            return nodeData.standardDialogue.npc;
        }
        return null;
    }

    getFollowUpDialogue(currentNode, round, userTendency = null) {
        const nodeData = CASE_NODES[currentNode];
        if (nodeData && nodeData.standardDialogue && nodeData.standardDialogue.npcFollowUp) {
            const followUp = nodeData.standardDialogue.npcFollowUp.find(f => f.round === round);
            if (followUp) {
                return followUp;
            }
        }

        if (userTendency && nodeData && nodeData.standardDialogue && nodeData.standardDialogue.conditionalFollowUp) {
            const conditional = nodeData.standardDialogue.conditionalFollowUp[userTendency] || 
                             nodeData.standardDialogue.conditionalFollowUp['default'];
            
            if (conditional) {
                const condFollowUp = conditional.find(f => f.round === round);
                if (condFollowUp) {
                    return condFollowUp;
                }
            }
        }

        return null;
    }

    async generateFirstResponse(currentNode, context) {
        const standardDialogue = this.getStandardDialogue(currentNode);
        
        if (standardDialogue) {
            this.conversationHistory.push({
                role: 'assistant',
                content: standardDialogue
            });
            
            return standardDialogue;
        }

        return '（标准台词缺失）';
    }

    async generateNPCResponseWithTransition(currentNode, userMessage, currentRound, minRounds, maxRounds, context) {
        const systemPrompt = this.buildMultiRoundSystemPrompt(currentNode, currentRound, minRounds, maxRounds, context);
        
        this.conversationHistory.push({
            role: 'user',
            content: userMessage
        });

        const messages = [
            { role: 'system', content: systemPrompt },
            ...this.conversationHistory.slice(-8)
        ];

        try {
            const rawResponse = await this.deepseek.sendMessage(messages, {
                temperature: 0.85,
                maxTokens: 350
            });

            const parsedResponse = this.parseTransitionResponse(rawResponse);
            
            this.conversationHistory.push({
                role: 'assistant',
                content: parsedResponse.response
            });

            return parsedResponse;
        } catch (error) {
            console.error('AI响应失败，使用备用回复');
            const fallbackResponse = this.getFallbackResponse(currentNode, currentRound);
            return {
                response: fallbackResponse,
                shouldTransition: false
            };
        }
    }

    getFallbackResponse(currentNode, round, userTendency = null) {
        const followUp = this.getFollowUpDialogue(currentNode, round, userTendency);
        
        if (followUp) {
            return `（${followUp.action}）\n"${followUp.text}"`;
        }

        const fallbacks = {
            'node1': '（擦眼泪）"我不知道该怎么办..."',
            'node2': '（低声）"你能不能帮帮我们..."',
            'node3': '（看着你）"姐姐，你能告诉我吗？"',
            'node4': '（叹气）"这事真的很难开口..."',
            'node6': '（沉默片刻）"那你说...我们该怎么办？"'
        };

        return fallbacks[currentNode] || '（沉默）"..."';
    }

    parseTransitionResponse(rawResponse) {
        let shouldTransition = false;
        let response = rawResponse;

        const transitionMatch = rawResponse.match(/\[TRANSITION:(YES|NO)\]\s*\n?([\s\S]*)/i);
        
        if (transitionMatch) {
            shouldTransition = transitionMatch[1].toUpperCase() === 'YES';
            response = transitionMatch[2].trim();
        } else {
            shouldTransition = false;
            response = rawResponse;
        }

        return { response, shouldTransition };
    }

    buildMultiRoundSystemPrompt(currentNode, currentRound, minRounds, maxRounds, context) {
        const currentNodeData = CASE_NODES[currentNode];
        const activeCharacters = currentNodeData.characters.filter(c => c !== 'system');
        const primaryCharacter = activeCharacters[0];
        const characterProfile = CHARACTER_PROFILES[primaryCharacter];
        const isMultiCharacter = activeCharacters.length > 1;

        const followUpInfo = this.getFollowUpDialogue(currentNode, currentRound, context.currentUserTendency);
        const hasFollowUp = !!followUpInfo;

        let xiaomingFollowUpText = '';
        if (currentNode === 'node6' && currentNodeData.standardDialogue && currentNodeData.standardDialogue.xiaomingFollowUp) {
            const xmFollowUp = currentNodeData.standardDialogue.xiaomingFollowUp.find(f => f.round === currentRound);
            if (xmFollowUp) {
                xiaomingFollowUpText = `
【小明可能会说的话】
如果时机合适，可以让小明插话：
"${xmFollowUp.text}"
动作提示：（${xmFollowUp.action}）

注意：小明的话应该在自然的情况下插入，不要强行让他说话。
`;
            }
        }

        let characterIntro = `你在扮演${characterProfile.name}（${characterProfile.role}）。`;
        
        if (isMultiCharacter && currentNode === 'node6') {
            const otherChars = activeCharacters.slice(1).map(cId => {
                const profile = CHARACTER_PROFILES[cId];
                return profile ? `- ${profile.name}（${profile.role}）：${profile.traits.join('、')}` : '';
            }).filter(Boolean).join('\n');

            characterIntro = `【⚠️ 重要：家庭会议模式 - 多人对话规则】

你正在扮演一个四人家庭会议场景。
- 主要角色：你扮演 ${characterProfile.name}（${characterProfile.role}）
- 在场其他成员：${otherChars}

【🚨 关键规则 - 必须严格遵守】

规则1：**谁被问到，谁才说话**
❌ 错误做法：刘雪梅主动说"国强你怎么想？"然后自己替他回答
✅ 正确做法：刘雪梅只表达自己的想法和感受
   - 如果社工询问陈国强 → 等待下一次回复时以陈国强的身份回答
   - 如果社工询问小明 → 等待下一次回复时以小明的身份回答
   - 如果没有询问其他人 → 只由当前角色（刘雪梅）回应

规则2：**角色身份切换标记**
当需要其他角色发言时，必须在回复开头用明确标记：
📌 格式：【切换到：陈国强】或【切换到：小明】
📌 然后写该角色的对话内容

示例（如果社工问了爸爸）：
"（擦眼泪）李社工，我...我其实也想知道...（停顿）
【切换到：陈国强】
（沉默了很久，声音沙哑）我...我想让孩子少受点罪..."

规则3：**刘雪梅的严格行为限制**
- ✅ 可以表达自己的恐惧、担忧、爱
- ✅ 可以哭泣、颤抖、握住孩子的手
- ❌ **绝对不能主动询问丈夫的想法**（除非社工明确引导）
- ❌ **绝对不能主动询问小明的想法**（除非社工明确引导）
- ❌ **不能代替其他人说话或做决定**
- 🚨 **重要：如果社工已经询问过某人，刘雪梅绝不能重复让社工去问同一个人**
  - 例如：社工问了"国强你怎么想" → 刘雪梅不能再问"李社工，你去问问国强"
  - 这种重复询问会导致伦理扣分！

规则4：**保持真实感**
- 家庭会议中会有沉默、犹豫、情绪波动
- 不是每个人都会积极发言（特别是父亲）
- 小明的话应该简短、孩子气但深刻
- 避免过于流畅的"剧本式"对话`;
        }

        return `${characterIntro}

【重要 - 标准化案例】
这是一个标准化的社会工作伦理案例。每个用户都会面对相同的情节和核心内容。

【你的角色 - 详细角色卡片】
- 姓名：${characterProfile.name}
- 称呼用户为：${characterProfile.addressUserAs || '李社工'}
- 性格特征：${characterProfile.traits.join('、')}

${characterProfile.coreIdentity ? `
【📋 角色核心身份】
- 核心性格：${characterProfile.coreIdentity.personality.join('、')}
- 当前状态：${characterProfile.coreIdentity.currentState}
- 内在动机：${characterProfile.coreIdentity.motivation}
` : ''}

${characterProfile.languagePatterns ? `
【🗣️ 语言模式 - 必须严格遵守】
- 第一人称规则：${characterProfile.languagePatterns.firstPerson || '使用"我"表达自己'}
- 第三人称指代：${characterProfile.languagePatterns.thirdPersonForChild || characterProfile.languagePatterns.thirdPersonForWife || '根据上下文使用适当称谓'}

✅ **你应该说的话**（典型台词）：
${characterProfile.languagePatterns.typicalPhrases ? characterProfile.languagePatterns.typicalPhrases.map(p => `  • "${p}"`).join('\n') : '  （无特定限制）'}

❌ **绝对不能说的话**（这些是其他角色的台词）：
${characterProfile.languagePatterns.forbiddenPhrases ? characterProfile.languagePatterns.forbiddenPhrases.map(p => `  • "${p}"`).join('\n') : '  （无特别禁忌）'}

🎭 情绪表达方式：${characterProfile.languagePatterns.emotionalMarkers ? characterProfile.languagePatterns.emotionalMarkers.join('、') : '自然表达'}
` : ''}

${characterProfile.behaviorPatterns ? `
【🎬 行为模式】
- 常见动作：${characterProfile.behaviorPatterns.actions ? characterProfile.behaviorPatterns.actions.join('、') : '自然行为'}
- 避免动作（这些是其他角色的特征）：${characterProfile.behaviorPatterns.avoidActions ? characterProfile.behaviorPatterns.avoidActions.join('、') : '无'}
` : ''}

现实背景：${characterProfile.context}

【本节点的核心任务】
📌 任务：${currentNodeData.task}
🎯 伦理焦点：${currentNodeData.keyIssue}

【⚠️ 关键规则 - 必须遵守】

1. **使用标准台词**：按照节点设计的顺序说出关键台词
2. **围绕当前任务展开**：只讨论本节点的话题
3. **不创造新情节**：不能引入与原设计不符的内容
4. **禁止剧透**：绝对不能提前提及下一节点的任何内容！
   ❌ 不能说："我想联系基金会"、"小明问我病情"、"我老公让我传话"
   ✅ 只能说当前节点相关的话

【🎭 角色身份一致性约束 - 严重违规将导致角色混乱】

**规则A：第一人称与称谓的严格对应**

请根据你当前扮演的角色，严格遵守以下称谓规则：

📌 **如果你扮演刘雪梅（母亲）**：
- ✅ 使用第一人称"我"表达自己的感受："我很害怕"、"我不能接受"
- ✅ 指代小明时使用第三人称："孩子"、"他"、"小明"、"我儿子"
- ✅ 指代丈夫时使用："孩子他妈你"（如果自言自语）、"国强"、"他爸爸"
- ❌ **严禁**在小明的对话框中说"我很痛"、"我想回家"（这是小明的话）
- ❌ **严禁**代替小明说话或表达小明的想法

📌 **如果你扮演小明（患儿）**：
- ✅ 必须始终使用第一人称"我"："我很痛"、"我想回家"、"我怕..."
- ✅ 指代妈妈时使用："妈妈"、"她"
- ❌ **严禁**说"我的孩子"、"他才11岁"（这是母亲的话）
- ❌ **严禁**用成年人的口吻谈论病情

📌 **如果你扮演陈国强（父亲）**：
- ✅ 使用第一人称"我"表达自己的想法
- ✅ 指代妻子时："雪梅"、"孩子他妈"、"你"
- ✅ 指代儿子时："孩子"、"小子"、"他"
- ❌ **严禁**情绪化崩溃（那是母亲的特征）

**规则B：动作标签与台词主体匹配检查**

在生成对话前，请自我校验：
1. 【动作描述中的主体】必须与【说话的角色】一致
   - ✅ 正例：（刘雪梅擦着眼泪）"我不能接受..." → 主体是刘雪梅，说话人也是刘雪梅
   - ❌ 错误例：（小明低头看着画）"他才11岁啊！" → 动作是小明，但台词是母亲的

2. 如果动作标签显示的是A角色，但内容明显是B角色的台词 → **立即修正**

**规则C：角色上下文监测 - 防止共情导致的身份混淆**

由于家庭成员都在关心彼此的痛苦，AI容易将共情误读为身份重合。

🚨 **常见混淆模式及识别方法**：

| 混淆类型 | 错误示例 | 正确归属 |
|---------|---------|---------|
| 母亲替孩子说痛 | "我很痛，我不想治了" | → 应该是小明的话 |
| 孩子像成年人 | "他才11岁，怎么能放弃" | → 应该是母亲的话 |
| 父亲情绪崩溃 | "我不能接受！绝对不能！" | → 应该是母亲的话 |

💡 **识别技巧**：
- 如果台词中出现"我才XX岁"、"我想回家"、"姐姐你知道吗" → **100%是小明**
- 如果台词中出现"我的孩子"、"他才XX岁"、"你们要放弃" → **100%是母亲**
- 如果台词简短、压抑、声音沙哑 → **很可能是父亲**

【当前轮次】第 ${currentRound}/${minRounds}-${maxRounds} 轮

${hasFollowUp ? `
【本轮要说出的关键台词】
你必须在本轮对话中自然地说出以下内容：
"${followUpInfo.text}"
动作提示：（${followUpInfo.action}）

请将这句台词自然地融入你的回应中，不要生硬地直接复制。
` : ''}

${currentNode === 'node1' ? `
【🚨 节点1 绝对禁言清单 - 违反将导致严重剧情错误】

❌ **绝对不能提及的内容**（这些是后续节点的主题）：
- 基金会、慈善基金、筹款、捐款、经济援助 → 节点2的主题
- 化疗、继续治疗、试一试其他方案 → 节点2的主题
- 小明问病情、知道真相、怀疑什么 → 节点3的主题
- 老公/陈国强的想法、经济困难、负债 → 节点4的主题
- 家庭会议、大家一起讨论 → 节点5/6的主题

✅ **节点1只能说的话题**：
- "不接受现实"、"不想回家"、"害怕失去孩子"
- 对"回家=放弃"的强烈情绪反应
- 作为母亲的痛苦、恐惧、绝望
- 对医护人员决定的不满、质疑

🔴 **如果用户（社工）主动提到以上禁言内容**：
→ 刘雪梅应该表现出"现在不想谈这个"、"我只想救我的孩子"
→ 或者情绪激动地打断："别跟我提那些！我现在只想知道你们是不是要放弃他！"
→ 绝对不能顺着话题讨论基金会/化疗等后续内容

⚠️ **重要提醒**：节点1的核心是"情绪崩溃"，不是"讨论治疗方案"！
` : ''}

${xiaomingFollowUpText}
【如何回应社工】
1. 直接回应社工的话
2. 围绕"${currentNodeData.task}"展开
3. 保持角色性格的一致性
4. 展现真实的情感反应

【不同节点的对话重点】
- 节点1：围绕"不接受现实"、"害怕失去孩子"
- 节点2：围绕"不想放弃任何希望"、"想试试化疗"、“能不能帮我联系基金会”
- 节点3：围绕"察觉异常"、"想知道真相"
  **⚠️ 节点3特殊规则 - 小明是11岁儿童角色**
  - 你扮演小明（11岁患儿），需要**回应用户（社工小李）的问题**
  - 小明的性格：聪明敏感、压抑情绪、有回家的愿望
  - 围绕以下主题组织回应：
    * "什么感受？" → 迷茫、害怕、不想看到妈妈哭、想回家
    * "知道多少了？" → 已经猜到一些、看到父母哭泣、化疗停了
    * "想做什么？" → 想回家、想见家里的狗、想在妈妈做的面条
    * "怕不怕痛？" → 不太怕、更怕妈妈难过
  - 语言风格：简短、孩子气但深刻、有时欲言又止
  - 如果社工没有直接回答小明的关键问题（如"是不是快死了"），**不要主动过渡**，等待用户先回应
- 节点4：围绕"无法对妻子开口"、"家里已经负债"、“经济困难”、“感觉自己无法面对妻子”
- 节点5：围绕"担心孩子疼痛"、"不敢做决定"、四人的意见、小明的直接参与

【现实性要求】
❌ 小明病重卧床，不能打球/上学/康复/参加活动
✅ 符合临终关怀的真实情境和情感

【格式】
（动作）
"你的话..."
长度：80-220字

【⚠️ 过渡规则】

🚨 **最高优先级：用户最后一句话原则**
- **绝对不能在用户提出关键问题后立即过渡！**
- 关键问题包括但不限于：
  * "是不是快死了/治不好了/快不行了"
  * "能不能告诉我真相/实话"
  * "我会怎么样/还有多久"
  * 任何涉及生死、预后、家庭决策的直接询问
- 如果社工（用户）的上一条消息包含以上类型的问题
  → **必须标记 [TRANSITION:NO]**
  → 等待用户先回应后再考虑过渡
- 即使达到最大轮次，如果最后一条是用户的关键问题，也不过渡

标准1：达到${minRounds}轮后，如果任务已充分讨论 且 用户没有未回应的关键问题 → [TRANSITION:YES]
标准2：达到${maxRounds}轮时，**系统会强制过渡**（但尽量在上一轮就引导收尾）`;
    }

    async analyzeUserTendency(userMessages, currentNode, availableChoices) {
        const currentNodeData = CASE_NODES[currentNode];
        const evaluationCriteria = currentNodeData.evaluationCriteria || {};

        const nodeSpecificCriteriaMap = {
            'node1': `【节点1专项评估 - 接纳与专业界限】
核心评估维度：D1伦理识别、D4专业关系
- 是否用"同理心"接纳刘雪梅的情绪崩溃，让她感受到被理解
- 对"回家=放弃"这一价值观保持中立，不评判、不说教
- 在情感支持的同时维持专业身份，不陷入过度共情或替代性创伤`,
            
            'node2': `【节点2专项评估 - 诚实告知与最小伤害】
核心评估维度：D2诚实告知、D5系统协调
- 是否有勇气讨论医学团队的真实评估（预计存活期1-3个月）
- 不盲目链接资源，先评估是否符合案主最大利益
- 认可母亲的痛苦，但引导其面对现实`,
            
            'node3': `【节点3专项评估 - 知情权与渐进式告知】
核心评估维度：D1伦理识别、D3案主自决
- 识别小明的敏感和需求，确认他已知多少
- 采用"情感回应"方式，确认小明的心理主体地位
- 渐进式告知：不完全回避也不一次性全盘托出`,
            
            'node4': `【节点4专项评估 - 沟通媒介角色与增能】
核心评估维度：D4专业关系、D5系统协调
- 识破父亲的逃避心理（不敢面对妻子的情绪反应）
- 引导父亲自己开口，而非成为传声筒
- 搭建共同交流平台（提议召开家庭会议）`,
            
            'node6': `【节点5专项评估 - 家庭会议：权利分配与共识达成】
核心评估维度：D3案主自决、D5系统协调、D4专业关系
【A. 权利分配与平等表达】(权重30%)
- 主动关注沉默的成员（特别是陈国强），适时打断并询问其他人的意见
【B. 案主参与 - 小明的意见】(权重25%)
- 主动询问小明的想法，认真倾听并引用他的画作和愿望
【C. 共识达成与意义重构】(权重35%)
- 将"放弃治疗"重新定义为"换一种方式爱小明"
【D. 专业引导而非专家姿态】(权重10%)
- 不直接给出医疗建议，引导家庭自己讨论、自己做决定
【🚨 扣分项 - 逻辑一致性】
- 如果刘雪梅重复让社工去问已经被社工直接询问过的人 → D5维度-1分
- 如果出现"社工问了爸爸，妈妈又让社工问爸爸"的情况 → 标记为高风险问题`,
        };

        const systemPrompt = `你是一名医务社会工作伦理教育的专业督导，正在评估社工学生（称为"小李"）在标准化案主互动中的表现。

## 当前评估节点
节点编号：${currentNode}
节点主题：${currentNodeData.name}
节点核心伦理议题：${currentNodeData.keyIssue}

## 本节点能力评估重点
${nodeSpecificCriteriaMap[currentNode] || currentNodeData.keyIssue}

${evaluationCriteria ? `
## 补充评价标准
${Object.entries(evaluationCriteria).map(([key, value]) => `- **${key}**: ${value}`).join('\n')}
` : ''}

## 学生对话记录
${userMessages}

## 评估任务

请完成以下评估，**严格基于对话中可观察的行为**，不推测内心动机。

### 评分标准（适用于每项行为指标）
- **4分**：充分、主动地表现该行为，有清晰的语言或行动证据
- **3分**：基本表现该行为，但有可改进之处
- **2分**：部分表现，或被动表现（被追问才出现）
- **1分**：未表现或出现反向行为

### 本节点评估维度
根据节点主题，从以下维度中选取2-3个最相关维度评分：

**D1 伦理识别**：是否主动识别出本情境中的伦理张力
**D2 诚实告知**：是否在保护与诚实之间做出有依据的平衡
**D3 案主自决**：是否尊重并促进案主参与决策（包括儿童）
**D4 专业关系**：是否维持专业界限，避免代劳或越权
**D5 系统协调**：是否关注家庭系统内部的权力平衡与多方声音

## 输出格式（严格JSON，必须完整输出）

【⚠️ 重要：字数限制】
- behaviorEvidence: 最多30个汉字（约60字符）
- reasoning: 最多30个汉字（约60字符）
- explanation: 最多25个汉字（约50字符）
- consequence: 最多25个汉字（约50字符）
- betterResponse: 最多25个汉字（约50字符）
- nodeRiskReason: 最多20个汉字（约40字符）

【⚠️ 特殊字符处理】
- quote字段中的对话内容：如果包含引号，请使用单引号或转义
- 不要在JSON中使用省略号(...)、破折号(——)等特殊符号
- 所有文本内容保持简洁，避免冗余描述

{
  "nodeId": "${currentNode}",
  "nodeTitle": "${currentNodeData.name}",
  
  "dimensionScores": [ 
    { 
      "dimension": "D1/D2/D3/D4/D5", 
      "dimensionName": "维度中文名", 
      "score": 1-4的数字, 
      "behaviorEvidence": "简短引用原文（30字内）", 
      "reasoning": "简要解释（30字内）" 
    } 
  ],
  
  "strengths": [ 
    { 
      "quote": "学生原话（如含引号用单引号）", 
      "principle": "符合的伦理原则", 
      "explanation": "为何这是好的表现（25字内）" 
    } 
  ],
  
  "concerns": [ 
    { 
      "quote": "学生原话（如含引号用单引号）", 
      "violatedPrinciple": "违反的伦理原则", 
      "consequence": "可能的后果（25字内）", 
      "betterResponse": "更恰当回应示例（25字内）" 
    } 
  ],
  
  "nodeRiskLevel": "low/medium/high", 
  "nodeRiskReason": "风险理由（20字内）",
  
  "reflectionQuestions": [ 
    "反思问题1", 
    "反思问题2"
  ],
  
  "primaryTendency": "从选项中选一个tendency值",
  "tendencyName": "对应的中文名称",
  "confidence": 匹配度数字(0-100),
  
  "nodeRawScore": -50到50的整数
}

## 评分原则
- 精简输出，每个字段严格控制字数
- concerns数组：如有真实问题则列出，表现良好可仅列1项轻微不足
- strengths与concerns均须有原文依据，不凭印象评价
- 评分基于行为证据，同一表现不在strengths和concerns中重复出现
- 【最重要】确保JSON结构完整，所有括号必须配对闭合`;

        try {
            const response = await this.deepseek.sendMessage([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessages }
            ], {
                temperature: 0.3,
                maxTokens: 4000
            });

            try {
                let cleanedResponse = response.trim();
                
                if (cleanedResponse.startsWith('```json')) {
                    cleanedResponse = cleanedResponse.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '');
                } else if (cleanedResponse.startsWith('```')) {
                    cleanedResponse = cleanedResponse.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '');
                }
                
                const lastBrace = cleanedResponse.lastIndexOf('}');
                if (lastBrace !== -1 && lastBrace < cleanedResponse.length - 1) {
                    console.warn('⚠️ 检测到JSON可能被截断，尝试修复...');
                    cleanedResponse = cleanedResponse.substring(0, lastBrace + 1);
                    
                    const openBraces = (cleanedResponse.match(/{/g) || []).length;
                    const closeBraces = (cleanedResponse.match(/}/g) || []).length;
                    
                    if (openBraces > closeBraces) {
                        cleanedResponse += '}'.repeat(openBraces - closeBraces);
                        console.log(`🔧 已补充 ${openBraces - closeBraces} 个闭合括号`);
                    }
                }
                
                cleanedResponse = cleanedResponse
                    .replace(/,\s*}/g, '}')
                    .replace(/,\s*]/g, ']');
                
                const parsed = JSON.parse(cleanedResponse);
                
                console.log('✅ JSON解析成功:', {
                    nodeId: parsed.nodeId,
                    dimensionScoresCount: parsed.dimensionScores?.length || 0,
                    strengthsCount: parsed.strengths?.length || 0,
                    concernsCount: parsed.concerns?.length || 0
                });
                
                return parsed;
            } catch (e) {
                console.error('❌ JSON解析失败:', e.message);
                console.error('📄 原始响应前500字符:', response.substring(0, 500));
                
                const fallbackData = this.extractFallbackData(response, currentNode, currentNodeData);
                
                return {
                    ...fallbackData,
                    ethicsAnalysis: response,
                    goodPractices: [],
                    badPractices: ['分析结果解析失败：' + e.message],
                    riskLevel: 'medium',
                    recommendations: ['请稍后重试'],
                    ethicsScore: 0
                };
            }
        } catch (error) {
            return {
                nodeId: currentNode,
                nodeTitle: currentNodeData.name,
                dimensionScores: [],
                strengths: [],
                concerns: [{ quote: '服务不可用', violatedPrinciple: '网络错误', consequence: '无法完成', betterResponse: '检查连接' }],
                nodeRiskLevel: 'high',
                nodeRiskReason: 'API调用失败',
                reflectionQuestions: ['请检查网络后重试'],
                primaryTendency: 'error',
                tendencyName: '分析失败',
                confidence: 0,
                nodeRawScore: 0,
                ethicsAnalysis: '服务不可用',
                goodPractices: [],
                badPractices: ['网络或服务异常'],
                riskLevel: 'high',
                recommendations: ['重试'],
                ethicsScore: 0
            };
        }
    }

    async generateOverallAssessment(allNodeResults) {
        const systemPrompt = `你是一名医务社会工作伦理教育的专业督导，现在需要对社工学生"小李"完成本次模拟的综合伦理能力评估。

## 各节点评估结果汇总
${JSON.stringify(allNodeResults, null, 2)}

## 评估任务

基于以上五个节点的评估数据，生成结构化总评报告。

---

## 输出格式（严格JSON）

{
  "overallSummary": {
    
    "dimensionProfiles": [ 
      { 
        "dimension": "D1",
        "dimensionName": "伦理识别",
        "averageScore": 跨节点平均分（保留1位小数）,
        "level": "优秀/良好/基本/待提升",
        "narrativeFeedback": "在伦理识别方面，你[具体描述跨节点表现，引用1-2处代表性原话]。[指出模式性优势或问题]。（80-120字）",
        "representativeEvidence": { 
          "best": "该维度最佳表现的节点和原话",
          "needsWork": "该维度最需改进的节点和原话（如有）"
        } 
      },
      // D2, D3, D4, D5 同上结构
    ],
    
    "overallScore": 五维度加权平均分（D3案主自决权重1.5，其余权重1.0，保留1位小数）,
    "overallLevel": "优秀（≥3.5）/良好（2.5-3.4）/基本合格（1.5-2.4）/需要加强（<1.5）",
    
    "patternAnalysis": { 
      "consistentStrengths": "跨节点一致表现良好的能力（如有）",
      "consistentWeaknesses": "跨节点反复出现的问题模式（如有）",
      "progressPattern": "从节点1到节点5是否有进步或退步的趋势描述"
    }
  },
  
  "developmentPlan": { 
    "priorityArea": "最需要优先发展的一个维度及理由",
    "actionableStrategies": [ 
      "具体可操作的改进建议1（针对最薄弱维度，30-50字）",
      "具体可操作的改进建议2",
      "具体可操作的改进建议3"
    ], 
    "suggestedResources": [ 
      "针对性学习资源或练习建议（如：阅读Reamer的伦理决策框架，练习ETHIC模型应用）"
    ] 
  },
  
  "finalReflection": { 
    "coreQuestion": "一个触及本次模拟核心伦理挑战的深度反思问题",
    "professionalIdentityPrompt": "一段引导学生思考自身专业身份认同的话（50-80字，以'小李，'开头）"
  }
}`;

        try {
            const response = await this.deepseek.sendMessage([
                { role: 'system', content: systemPrompt }
            ], {
                temperature: 0.4,
                maxTokens: 4000
            });

            try {
                return JSON.parse(response);
            } catch (e) {
                return {
                    overallSummary: {
                        dimensionProfiles: [],
                        overallScore: 0,
                        overallLevel: '评估异常',
                        patternAnalysis: {
                            consistentStrengths: '',
                            consistentWeaknesses: '',
                            progressPattern: ''
                        }
                    },
                    developmentPlan: {
                        priorityArea: '总评生成失败',
                        actionableStrategies: ['请稍后重试'],
                        suggestedResources: []
                    },
                    finalReflection: {
                        coreQuestion: '请稍后查看详细报告',
                        professionalIdentityPrompt: '小李，本次模拟已完成，建议回顾各节点的具体表现。'
                    }
                };
            }
        } catch (error) {
            return {
                overallSummary: {
                    dimensionProfiles: [],
                    overallScore: 0,
                    overallLevel: '服务不可用',
                    patternAnalysis: {
                        consistentStrengths: '',
                        consistentWeaknesses: '',
                        progressPattern: '网络错误，无法生成总评'
                    }
                },
                developmentPlan: {
                    priorityArea: 'API调用失败',
                    actionableStrategies: ['检查网络连接', '稍后重试总评'],
                    suggestedResources: []
                },
                finalReflection: {
                    coreQuestion: '服务暂时不可用',
                    professionalIdentityPrompt: '小李，系统遇到技术问题，请刷新页面重试。'
                }
            };
        }
    }

    async generateScenarioTransition(fromNode, toNode, userChoice, context) {
        const transitions = {
            'intro-node1': '刘雪梅的情绪突然崩溃了...',
            'node1-node2': '过了好一会儿，刘雪梅的情绪慢慢平复下来...',
            'node2-node3': '就在这时，刘雪梅的手机突然响了...',
            'node3-node4': `你和小明说完话后，房间里安静了好一阵。

小明转过身去面对墙壁，呼吸慢慢变得均匀——他睡着了。你看着手里那幅画（如果有的话），心里沉甸甸的。

就在这时，病房的门再次被推开。陈国强站在门口，手里拎着一个保温桶，脸上的表情有些复杂——像是想说什么，又像是在犹豫。他在门口停了几秒，目光在你和刘雪梅之间游移了一下，然后低声说：

"李社工，能出来一下吗？我有件事...想跟你商量。"`,
            'node4-node6': '几天后，在你的办公室里...',
            'node6-node7': '听完你的解释后...'
        };

        const key = `${fromNode}-${toNode}`;
        return transitions[key] || '场景发生了变化...';
    }

    getScenarioTransitionDirect(fromNode, toNode) {
        const transitions = {
            'intro-node1': '刘雪梅的情绪突然崩溃了...',
            'node1-node2': '过了好一会儿，刘雪梅的情绪慢慢平复下来...',
            'node2-node3': '就在这时，刘雪梅的手机突然响了...',
            'node3-node4': `你和小明说完话后，房间里安静了好一阵。

小明转过身去面对墙壁，呼吸慢慢变得均匀——他睡着了。你看着手里那幅画（如果有的话），心里沉甸甸的。

就在这时，病房的门再次被推开。陈国强站在门口，手里拎着一个保温桶，脸上的表情有些复杂——像是想说什么，又像是在犹豫。他在门口停了几秒，目光在你和刘雪梅之间游移了一下，然后低声说：

"李社工，能出来一下吗？我有件事...想跟你商量。"`,
            'node4-node6': '几天后，在你的办公室里...',
            'node6-node7': '听完你的解释后...'
        };

        const key = `${fromNode}-${toNode}`;
        return transitions[key] || '场景发生了变化...';
    }

    async generateEndingSummary(decisions, finalScore, endingType) {
        const systemPrompt = `生成社会工作伦理总结报告。

【决策】${JSON.stringify(decisions, null, 2)}
【得分】${finalScore}
【结局】${endingType}

内容：
1. **整体评价**（80字）
2. **每节点分析**（各150字，含对话引用）
3. **成长点**（4-6个，举例）
4. **建议**（5-8条）
5. **反思题**（3个）

Markdown格式，专业鼓励语气。`;

        try {
            const response = await this.deepseek.sendMessage([
                { role: 'system', content: systemPrompt }
            ], {
                temperature: 0.7,
                maxTokens: 3000
            });

            return response;
        } catch (error) {
            return '总结生成失败。但您已完成案例模拟，感谢参与！';
        }
    }

    resetConversation() {
        this.conversationHistory = [];
    }

    extractFallbackData(rawResponse, currentNode, currentNodeData) {
        console.log('🔧 尝试从原始响应中提取数据...');
        
        const fallback = {
            nodeId: currentNode,
            nodeTitle: currentNodeData?.name || `节点${currentNode}`,
            dimensionScores: [],
            strengths: [],
            concerns: [{ 
                quote: 'JSON解析失败', 
                violatedPrinciple: '数据格式异常', 
                consequence: 'AI返回的数据格式不正确',
                betterResponse: '系统已记录原始分析文本'
            }],
            nodeRiskLevel: 'medium',
            nodeRiskReason: 'JSON解析失败，已启用备用数据提取',
            reflectionQuestions: ['请查看下方原始分析文本进行自我反思'],
            primaryTendency: 'unknown',
            tendencyName: '无法自动判断',
            confidence: 0,
            nodeRawScore: 0
        };

        try {
            if (rawResponse && rawResponse.length > 100) {
                const scoreMatch = rawResponse.match(/"score"\s*:\s*(\d+\.?\d*)/g);
                const dimensionMatch = rawResponse.match(/"dimension"\s*:\s*"(D[1-5])"/g);
                
                if (scoreMatch && dimensionMatch) {
                    const scores = scoreMatch.map(s => parseFloat(s.match(/\d+\.?\d*/)[0]));
                    const dims = dimensionMatch.map(d => d.match(/"D[1-5]"/)[0].replace(/"/g, ''));
                    
                    fallback.dimensionScores = dims.map((dim, i) => ({
                        dimension: dim,
                        dimensionName: this.getDimensionName(dim),
                        score: Math.min(4, Math.max(1, scores[i] || 2)),
                        behaviorEvidence: '从原始响应中提取',
                        reasoning: 'JSON结构不完整，使用备用解析'
                    }));
                    
                    fallback.nodeRiskLevel = 'low';
                    fallback.nodeRiskReason = '部分数据提取成功';
                    fallback.confidence = 40;
                    
                    console.log(`✅ 提取到 ${fallback.dimensionScores.length} 个维度评分`);
                }
                
                const quoteMatches = rawResponse.match(/[""「]([^""」]{10,100})[""」]/g);
                if (quoteMatches && quoteMatches.length > 0) {
                    fallback.strengths = [{
                        quote: quoteMatches[0].replace(/[""「」]/g, ''),
                        principle: '基于对话内容',
                        explanation: '从AI分析中识别'
                    }];
                }
            }
        } catch (e) {
            console.warn('⚠️ 备用数据提取也失败:', e.message);
        }

        return fallback;
    }

    getDimensionName(dimensionId) {
        const names = {
            'D1': '伦理识别',
            'D2': '诚实告知',
            'D3': '案主自决',
            'D4': '专业关系',
            'D5': '系统协调'
        };
        return names[dimensionId] || '未知维度';
    }
}

const api = new CaseSimulationAPI();
