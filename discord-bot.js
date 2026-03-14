/**
 * Discord Bot - ChatGPTサインアップ自動化 (Firefox/Chrome自動切り替え)
 * Slash Command: /create-account
 */

const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require('discord.js');
const { spawn } = require('child_process');
const path = require('path');
const { safeDeferReply, safeEditReply, isUnknownInteractionError } = require('./utils/discord-interaction');
const {
    parseCreateAccountResult,
    resolveCreateAccountChildTimeoutMs,
    summarizeCreateAccountFailure
} = require('./utils/create-account-runtime');

require('./src/utils/load-env');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!TOKEN) {
    console.error('❌ DISCORD_TOKENが設定されていません');
    process.exit(1);
}

// アカウント保存管理モジュール
const {
    getAllAccounts, removeAccount, loadAccounts, saveCreatedAccounts
} = require('./workspace_manager');

// コマンド定義
const commands = [
    new SlashCommandBuilder()
        .setName('create-account')
        .setDescription('ChatGPTワークスペースを作成します')
        .addIntegerOption(option =>
            option
                .setName('count')
                .setDescription('作成するアカウント数（1-30）')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(30)
        )
        .addBooleanOption(option =>
            option
                .setName('keep')
                .setDescription('完了後もChromeを開いたままにする')
                .setRequired(false)
        )
        .toJSON(),
    new SlashCommandBuilder()
        .setName('openbrowser')
        .setDescription('ブラウザを起動します')
        .addStringOption(option =>
            option
                .setName('browser')
                .setDescription('使用するブラウザ')
                .setRequired(false)
                .addChoices(
                    { name: 'Brave', value: 'brave' },
                    { name: 'Chrome', value: 'chrome' }
                )
        )
        .toJSON(),
    new SlashCommandBuilder()
        .setName('account-list')
        .setDescription('保存済みアカウントの一覧表示と削除')
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('保存済みアカウント一覧を表示')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('保存済みアカウントを削除')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('削除するアカウント名')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .toJSON()
];

// コマンド登録
const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('🔄 スラッシュコマンドを登録中...');
        
        // グローバルコマンドを空に（過去のコマンドを削除）
        console.log('🌐 グローバルコマンドをクリア...');
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: [] }
        );
        console.log('✅ グローバルコマンドをクリアしました');
        
        if (GUILD_ID) {
            // ギルドコマンドを登録（即時反映）
            await rest.put(
                Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
                { body: commands }
            );
            console.log(`✅ サーバー ${GUILD_ID} にコマンドを登録しました`);
            console.log('📋 登録済みコマンド:');
            commands.forEach(cmd => console.log(`   • /${cmd.name}`));
        } else {
            // グローバルコマンドを登録（反映に最大1時間）
            await rest.put(
                Routes.applicationCommands(CLIENT_ID),
                { body: commands }
            );
            console.log('✅ グローバルコマンドを登録しました');
            console.log('⏳ 反映に最大1時間かかる場合があります');
        }
    } catch (error) {
        console.error('❌ コマンド登録エラー:', error);
    }
})();

// Botクライアント作成
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

const MAX_CONCURRENT_CREATE_ACCOUNT = 5;
const CREATE_ACCOUNT_CHILD_TIMEOUT_MS = resolveCreateAccountChildTimeoutMs();

client.once('clientReady', () => {
    console.log(`✅ Discord Bot ログイン完了: ${client.user.tag}`);
    console.log('🔄 Brave/Chrome自動切り替えモード');
    console.log('🤖 /create-account コマンドでアカウント作成を開始できます');
});

// 進捗状況を更新する関数
async function updateProgress(interaction, step, percent) {
    const filledProgress = '🔵'.repeat(Math.floor(percent / 10)) + '⚪'.repeat(10 - Math.floor(percent / 10));
    
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('🚀 ChatGPTアカウント作成中')
        .setDescription(`\`${filledProgress}\` **${percent}%**\n\n📋 **${step}**`)
        .setTimestamp();
    
    await safeEditReply(interaction, {
        content: null,
        embeds: [embed]
    });
}

async function deliverCreateAccountResult(interaction, payload) {
    const delivered = await safeEditReply(interaction, payload);
    if (delivered) {
        return true;
    }

    if (!interaction?.channel || typeof interaction.channel.send !== 'function') {
        return false;
    }

    await interaction.channel.send(payload);
    return true;
}

// コマンド処理
client.on('interactionCreate', async (interaction) => {
    // Autocompleteハンドラ
    if (interaction.isAutocomplete()) {
        try {
            if (interaction.commandName === 'account-list' && interaction.options.getSubcommand() === 'remove') {
                const accounts = getAllAccounts();
                const focused = (interaction.options.getFocused() || '').toLowerCase();
                const choices = accounts
                    .filter((account) => account.name.toLowerCase().includes(focused))
                    .map((account) => ({
                        name: `${account.name} (${account.email})`.slice(0, 100),
                        value: account.name
                    }));
                await interaction.respond(choices.slice(0, 25));
                return;
            }
        } catch (error) {
            console.error('❌ Autocompleteエラー:', error);
            await interaction.respond([]);
        }
        return;
    }
    
    if (!interaction.isChatInputCommand()) return;

    try {
        if (interaction.commandName === 'create-account') {
            await handleCreateAccount(interaction);
            return;
        }

        if (interaction.commandName === 'openbrowser') {
            await handleOpenBrowser(interaction);
            return;
        }

        if (interaction.commandName === 'account-list') {
            await handleAccountListCommand(interaction);
            return;
        }
    } catch (error) {
        if (isUnknownInteractionError(error)) {
            console.warn('⚠️ Interactionの有効期限切れを検知したため処理を終了しました (10062)');
            return;
        }
        console.error('❌ interactionCreate処理エラー:', error);
    }
});

// ブラウザパスを検出
function detectBrowserPaths() {
    const fs = require('fs');
    const isMac = process.platform === 'darwin';
    const paths = { brave: null, chrome: null };
    
    const bravePaths = [
        process.env.BRAVE_PATH,
        ...(isMac ? [
            '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
            '/usr/bin/brave-browser'
        ] : [
            'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
            'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
        ])
    ];
    
    for (const p of bravePaths) {
        if (p && fs.existsSync(p)) {
            paths.brave = p;
            break;
        }
    }
    
    const chromePaths = [
        process.env.CHROME_PATH,
        ...(isMac ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/usr/bin/google-chrome'
        ] : [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
        ])
    ];
    
    for (const p of chromePaths) {
        if (p && fs.existsSync(p)) {
            paths.chrome = p;
            break;
        }
    }
    
    return paths;
}

// アカウント作成処理（並列対応）
async function handleCreateAccount(interaction) {
    // 作成数を取得（デフォルトは1）
    const count = interaction.options.getInteger('count') || 1;
    const keepOpen = interaction.options.getBoolean('keep') || false;
    
    // 3秒制限対策: 先にdeferしてから編集応答を返す
    const deferred = await safeDeferReply(interaction, { flags: 0 });
    if (!deferred) {
        return;
    }

    // ブラウザパスを検出
    const browserPaths = detectBrowserPaths();
    const availableBrowsers = [];
    if (browserPaths.chrome) availableBrowsers.push({ type: 'chrome', path: browserPaths.chrome, emoji: '🌐' });
    
    if (availableBrowsers.length === 0) {
        return safeEditReply(interaction, {
            content: '❌ Chrome が見つかりません。Google Chrome をインストールしてください。'
        });
    }

    const initialEmbed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`🚀 ChatGPTアカウント作成中 (0/${count})`)
        .setDescription(`⏳ 実行ブラウザ: ${availableBrowsers.map(b => b.emoji).join(' ')} Chrome\n🔒 keepモード: ${keepOpen ? 'ON' : 'OFF'}\n⚡ 最大${Math.min(count, MAX_CONCURRENT_CREATE_ACCOUNT)}件同時に処理します...`)
        .setTimestamp();

    const initialReplySent = await safeEditReply(interaction, {
        content: null,
        embeds: [initialEmbed], 
    });
    if (!initialReplySent) {
        return;
    }

    const results = [];
    const errors = [];
    let completed = 0;
    let animationInterval = null;

    // 各アカウントの進捗状況を管理
    const progressStatus = {};
    for (let i = 1; i <= count; i++) {
        const browserIndex = (i - 1) % availableBrowsers.length;
        const browserInfo = availableBrowsers[browserIndex];
        progressStatus[i] = {
            index: i,
            browser: browserInfo.type,
            emoji: browserInfo.emoji,
            status: '⏳',
            step: '準備中',
            percent: 0
        };
    }

    // ローディングアニメーション用
    const loadingFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let frameIndex = 0;

    try {
        // 並列処理用の関数
        const createAccountWithBrowser = async (index, browserInfo) => {
            try {
                // ステータスを実行中に更新
                progressStatus[index].status = '🔄';
                progressStatus[index].step = 'ブラウザ起動中';
                progressStatus[index].percent = 10;

                // カスタム進捗更新関数
                const customUpdateProgress = async (interaction, step, percent) => {
                    progressStatus[index].step = step;
                    progressStatus[index].percent = percent;
                };

                // ブラウザ指定でスクリプトを実行
                const result = await runSignupScriptWithBrowser(interaction, customUpdateProgress, browserInfo, {
                    keepOpen
                });
                
                // 完了ステータスに更新
                progressStatus[index].status = '✅';
                progressStatus[index].step = '完了';
                progressStatus[index].percent = 100;
                
                results.push({ ...result, browser: browserInfo.type, index });
                completed++;
                
            } catch (error) {
                console.error(`❌ アカウント ${index} の作成エラー:`, error);
                
                // エラーステータスに更新
                progressStatus[index].status = '❌';
                progressStatus[index].step = 'エラー';
                progressStatus[index].percent = 0;
                
                errors.push({ index, error: error.message, browser: browserInfo.type });
                completed++;
            }
        };

        // 進捗表示を更新する関数
        const updateProgressDisplay = async () => {
            try {
                frameIndex = (frameIndex + 1) % loadingFrames.length;
                const loadingFrame = loadingFrames[frameIndex];
                
                let description = '';
                
                for (let i = 1; i <= count; i++) {
                    const status = progressStatus[i];
                    const filled = Math.floor(status.percent / 10);
                    const empty = 10 - filled;
                    
                    // 絵文字プログレスバー
                    const progressBar = '🟩'.repeat(filled) + '⬜'.repeat(empty);
                    
                    if (status.status === '🔄') {
                        description += `${loadingFrame} ${status.emoji} #${i}: ${progressBar} ${status.percent}%\n   └ ${status.step}\n\n`;
                    } else if (status.status === '✅') {
                        description += `✅ ${status.emoji} #${i}: 🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩 100%\n   └ 完了\n\n`;
                    } else if (status.status === '❌') {
                        description += `❌ ${status.emoji} #${i}: 🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥 ERROR\n   └ ${status.step}\n\n`;
                    } else {
                        description += `⏳ ${status.emoji} #${i}: ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ 0%\n   └ 待機中\n\n`;
                    }
                }
                
                description += `━━━━━━━━━━━━━━━━\n`;
                description += `✅ 完了: ${results.length}  ⏳ 処理中: ${count - results.length - errors.length}  ❌ エラー: ${errors.length}`;

                const embed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle(`🚀 アカウント作成中 (${completed}/${count})`)
                    .setDescription(description)
                    .setTimestamp();

                await safeEditReply(interaction, { content: null, embeds: [embed] }).catch(() => {});
            } catch (e) {}
        };

        // アニメーション開始
        animationInterval = setInterval(updateProgressDisplay, 1000);

        let nextIndex = 1;
        const workerCount = Math.min(count, MAX_CONCURRENT_CREATE_ACCOUNT);
        const workers = Array.from({ length: workerCount }, async () => {
            while (nextIndex <= count) {
                const currentIndex = nextIndex;
                nextIndex += 1;
                const browserIndex = (currentIndex - 1) % availableBrowsers.length;
                const browserInfo = availableBrowsers[browserIndex];

                await createAccountWithBrowser(currentIndex, browserInfo);
            }
        });

        await Promise.all(workers);

        // アニメーション停止
        if (animationInterval) clearInterval(animationInterval);

        // 結果をインデックス順にソート
        results.sort((a, b) => a.index - b.index);
        errors.sort((a, b) => a.index - b.index);
        const savedAccounts = saveCreatedAccounts(results.map((result) => ({
            email: result.email,
            password: result.password,
            browser: result.browser,
            source: 'create-account'
        })));

        // 最終結果表示
        const embed = new EmbedBuilder()
            .setColor(errors.length === 0 ? 0x00FF00 : 0xFFA500)
            .setTitle(`✅ アカウント作成完了 (${results.length}/${count})`)
            .setTimestamp();

        // 成功したアカウントを表示
        if (results.length > 0) {
            let accountsText = '';
            results.forEach((result) => {
                const browserEmoji = result.browser === 'brave' ? '🦁' : '🌐';
                accountsText += `\n**アカウント ${result.index}** ${browserEmoji}\n`;
                accountsText += `📧 \`${result.email}\`\n`;
                accountsText += `🔑 \`${result.password}\`\n`;
            });

            if (savedAccounts.length > 0) {
                accountsText += `\n💾 JSON保存: ${savedAccounts.length}件`;
                savedAccounts.forEach((account) => {
                    accountsText += `\n・\`${account.name}\``;
                });
            }

            if (keepOpen) {
                accountsText += '\n\n🖥️ keepモードが有効なため、完了後もChromeは開いたままです';
            }
            
            embed.setDescription(accountsText);
        }

        // エラーがあれば表示
        if (errors.length > 0) {
            let errorText = '\n**⚠️ エラー**\n';
            errors.forEach(e => {
                const browserEmoji = e.browser === 'brave' ? '🦁' : '🌐';
                errorText += `アカウント ${e.index} ${browserEmoji}: ${e.error}\n`;
            });
            embed.addFields({ name: 'エラー詳細', value: errorText });
        }

        await deliverCreateAccountResult(interaction, {
            content: null,
            embeds: [embed]
        });

    } catch (error) {
        // エラー時もアニメーションを停止
        if (animationInterval) clearInterval(animationInterval);
        
        console.error('❌ エラー:', error);

        try {
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ エラーが発生しました')
                .setDescription(`\`\`\`${error.message}\`\`\``)
                .setTimestamp();

            await deliverCreateAccountResult(interaction, {
                content: null,
                embeds: [errorEmbed]
            });
        } catch (e) {
            console.error('Discord応答エラー:', e);
        }
    }
}

// Puppeteerスクリプト実行関数（ブラウザ指定対応）
function runSignupScriptWithBrowser(interaction, updateProgress, browserInfo, options = {}) {
    return new Promise((resolve, reject) => {
        // OSに応じてNodeパスを決定（macOS/Windows両対応）
        const nodePath = process.env.NODE_PATH || (process.platform === 'darwin' ? '/opt/homebrew/bin/node' : process.execPath);
        const scriptPath = path.join(__dirname, 'puppeteer_unified.js');
        const args = [scriptPath];

        if (options.keepOpen) {
            args.push('keep');
        }

        const child = spawn(nodePath, args, {
            env: {
                ...process.env,
                PATH: process.platform === 'darwin' ? '/opt/homebrew/bin:' + process.env.PATH : process.env.PATH,
                HEADLESS: process.env.HEADLESS || 'false',
                CREATE_ACCOUNT_KEEP_OPEN: options.keepOpen ? 'true' : 'false',
                FORCE_BROWSER: browserInfo.type, // ブラウザを強制指定
                BRAVE_PATH: browserInfo.type === 'brave' ? browserInfo.path : '',
                CHROME_PATH: browserInfo.type === 'chrome' ? browserInfo.path : ''
            },
            timeout: CREATE_ACCOUNT_CHILD_TIMEOUT_MS
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', async (data) => {
            const output = data.toString();
            stdout += output;
            console.log(output);

            try {
                if (output.includes('Step 1:') || output.includes('generator.email')) {
                    await updateProgress(interaction, 'メールアドレス生成中', 15);
                } else if (output.includes('Step 2:') || output.includes('Brave を起動中') || output.includes('Chrome を起動中')) {
                    await updateProgress(interaction, 'ブラウザ起動中', 30);
                } else if (output.includes('Step 5:')) {
                    await updateProgress(interaction, 'アカウント作成開始', 45);
                } else if (output.includes('Step 6:')) {
                    await updateProgress(interaction, 'パスワード設定中', 55);
                } else if (output.includes('Step 8:')) {
                    await updateProgress(interaction, '検証コード待機中', 65);
                } else if (output.includes('Step 9:')) {
                    await updateProgress(interaction, '検証コード入力中', 75);
                } else if (output.includes('Step 15:')) {
                    await updateProgress(interaction, 'ワークスペース作成ページへ', 85);
                } else if (output.includes('Step 16:')) {
                    await updateProgress(interaction, 'ワークスペース名入力中', 90);
                } else if (output.includes('Step 17:')) {
                    await updateProgress(interaction, '送信完了', 95);
                } else if (output.includes('アカウント作成完了')) {
                    await updateProgress(interaction, '完了！', 100);
                }
            } catch (e) {
                // 更新エラーは無視
            }
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
            console.error(data.toString());
        });

        child.on('close', (code, signal) => {
            const result = parseCreateAccountResult(stdout);

            if (code === 0 && result.email && result.password) {
                resolve(result);
            } else {
                reject(new Error(summarizeCreateAccountFailure({ code, signal, stdout, stderr })));
            }
        });

        child.on('error', (error) => {
            reject(error);
        });
    });
}

// Puppeteerスクリプト実行関数（後方互換性のため）
function runSignupScript(interaction, updateProgress) {
    return runSignupScriptWithProgress(interaction, updateProgress);
}

// ブラウザ起動処理
async function handleOpenBrowser(interaction) {
    const deferred = await safeDeferReply(interaction, { flags: 64 });
    if (!deferred) {
        return;
    }

    const browserChoice = interaction.options.getString('browser');
    const browserName = browserChoice ? browserChoice.toUpperCase() : '自動選択';

    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('🌐 ブラウザ起動')
        .setDescription(`${browserName}でブラウザを起動します...`)
        .setTimestamp();

    const initialReplySent = await safeEditReply(interaction, {
        content: null,
        embeds: [embed],
    });
    if (!initialReplySent) {
        return;
    }

    try {
        // OSに応じてNodeパスを決定（macOS/Windows両対応）
        const nodePath = process.env.NODE_PATH || (process.platform === 'darwin' ? '/opt/homebrew/bin/node' : process.execPath);
        const scriptPath = path.join(__dirname, 'open_browser.js');
        
        const args = [scriptPath];
        if (browserChoice) {
            args.push(browserChoice);
        }
        
        const child = spawn(nodePath, args, {
            env: { 
                ...process.env, 
                PATH: process.platform === 'darwin' ? '/opt/homebrew/bin:' + process.env.PATH : process.env.PATH,
                HEADLESS: 'false'
            },
            detached: true,
            stdio: 'ignore'
        });
        
        child.unref();
        
        // 完了メッセージ
        const successEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ ブラウザを起動しました')
            .setDescription(`${browserChoice === 'brave' ? '🦁 Brave' : browserChoice === 'chrome' ? '🌐 Chrome' : '🔍 自動選択'}でブラウザを起動しました。\n\n👆 **手順:**\n1. ブラウザがChatGPTに移動します\n2. 手動で操作してください\n3. ブラウザは30分間開いたまま維持されます`)
            .setTimestamp();

        await safeEditReply(interaction, {
            content: null,
            embeds: [successEmbed]
        });

    } catch (error) {
        console.error('❌ ブラウザ起動エラー:', error);

        const errorEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ エラーが発生しました')
            .setDescription(`\`\`\`${error.message}\`\`\``)
            .setTimestamp();

        await safeEditReply(interaction, {
            content: null,
            embeds: [errorEmbed]
        });
    }
}

async function handleAccountListCommand(interaction) {
    const subcommand = interaction.options.getSubcommand();

    await interaction.deferReply({ ephemeral: true });

    try {
        if (subcommand === 'list') {
            const accounts = getAllAccounts();

            if (accounts.length === 0) {
                return interaction.editReply({
                    content: '📋 保存済みアカウントはありません'
                });
            }

            const config = loadAccounts();
            const accountList = accounts.map((account, index) => {
                const isDefault = config.default_account === account.name ? ' ⭐' : '';
                const createdAt = account.createdAt
                    ? `<t:${Math.floor(new Date(account.createdAt).getTime() / 1000)}:f>`
                    : '不明';
                const browser = account.browser || 'unknown';
                return [
                    `**${index + 1}. ${account.name}**${isDefault}`,
                    `📧 \`${account.email}\``,
                    `🔑 \`${account.password}\``,
                    `🌐 ${browser}`,
                    `🕒 ${createdAt}`
                ].join('\n');
            }).join('\n\n');

            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`📋 保存済みアカウント一覧 (${accounts.length}件)`)
                .setDescription(accountList.slice(0, 4000))
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        if (subcommand === 'remove') {
            const name = interaction.options.getString('name');
            const removedAccount = removeAccount(name);

            if (!removedAccount) {
                return interaction.editReply({
                    content: `❌ アカウント「${name}」が見つかりません`
                });
            }

            await interaction.editReply({
                content: `✅ アカウント「${removedAccount.name}」を削除しました\n📧 \`${removedAccount.email}\``
            });
        }
    } catch (error) {
        console.error('❌ account-list コマンドエラー:', error);
        await interaction.editReply({
            content: `❌ エラーが発生しました: ${error.message}`
        });
    }
}


client.login(TOKEN);
