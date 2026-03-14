/**
 * Discord Bot - ChatGPTサインアップ自動化 (Firefox専用)
 * Slash Commands: 
 *   /create-account-individual - 個人用アカウント作成
 */

const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require('discord.js');
const { spawn } = require('child_process');
const path = require('path');

require('./utils/load-env');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!TOKEN) {
    console.error('❌ DISCORD_TOKENが設定されていません');
    process.exit(1);
}

// コマンド定義
const commands = [
    new SlashCommandBuilder()
        .setName('create-account')
        .setDescription('ChatGPTアカウントを自動作成します')
        .toJSON()
];

// コマンド登録
const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('🔄 スラッシュコマンドを登録中...');
        
        if (GUILD_ID) {
            await rest.put(
                Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
                { body: commands }
            );
            console.log(`✅ サーバー ${GUILD_ID} にコマンドを登録しました`);
        } else {
            await rest.put(
                Routes.applicationCommands(CLIENT_ID),
                { body: commands }
            );
            console.log('✅ グローバルコマンドを登録しました');
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

client.once('ready', () => {
    console.log(`✅ Discord Bot ログイン完了: ${client.user.tag}`);
    console.log('🦊 Firefox使用モード');
    console.log('🤖 /create-account コマンドでアカウント作成を開始できます');
});

// 進捗状況を更新する関数
async function updateProgress(interaction, step, percent) {
    const filledProgress = '🔵'.repeat(Math.floor(percent / 10)) + '⚪'.repeat(10 - Math.floor(percent / 10));
    
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('🦊 ChatGPTアカウント作成中')
        .setDescription(`\`${filledProgress}\` **${percent}%**\n\n📋 **${step}**`)
        .setTimestamp();
    
    await interaction.editReply({
        content: null,
        embeds: [embed]
    });
}

// コマンド処理
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'create-account') {
        await handleCreateAccount(interaction);
    }
});

// アカウント作成処理
async function handleCreateAccount(interaction) {
    // 即座に応答（3秒タイムアウト対策）
    const initialEmbed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('🦊 ChatGPTアカウント作成中')
        .setDescription('⏳ 開始しています...')
        .setTimestamp();
    
    await interaction.reply({ 
        embeds: [initialEmbed], 
        flags: 64 
    });
    
    try {
        await updateProgress(interaction, '準備中...', 0);
        
        // Firefox版スクリプトを実行
        const result = await runSignupScript(interaction, updateProgress);
        
        // 完了メッセージ
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🦊 アカウント作成完了！')
            .addFields(
                { name: '📧 Email', value: `\`${result.email}\``, inline: false },
                { name: '🔑 Password', value: `\`${result.password}\``, inline: false },
                { name: '👤 Name', value: result.name || '-', inline: false }
            )
            .setFooter({ text: 'ブラウザ: Firefox | ⚠️ この情報は他の人に見せないでください' })
            .setTimestamp();
        
        await interaction.editReply({
            content: null,
            embeds: [embed]
        });
        
    } catch (error) {
        console.error('❌ エラー:', error);
        
        try {
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ エラーが発生しました')
                .setDescription(`\`\`\`${error.message}\`\`\``)
                .setTimestamp();
            
            // interactionの状態に応じて適切なメソッドを使用
            if (interaction.replied && !interaction.deferred) {
                await interaction.editReply({
                    content: null,
                    embeds: [errorEmbed]
                });
            } else if (interaction.deferred) {
                await interaction.editReply({
                    content: null,
                    embeds: [errorEmbed]
                });
            }
        } catch (e) {
            console.error('Discord応答エラー:', e);
        }
    }
}

// Puppeteerスクリプト実行関数
function runSignupScript(interaction, updateProgress) {
    return new Promise((resolve, reject) => {
        const nodePath = '/opt/homebrew/bin/node';
        const scriptPath = path.join(__dirname, 'puppeteer_firefox.js');
        
        const child = spawn(nodePath, [scriptPath], {
            env: { 
                ...process.env, 
                PATH: '/opt/homebrew/bin:' + process.env.PATH,
                HEADLESS: process.env.HEADLESS || 'false'
            },
            timeout: 180000
        });
        
        let stdout = '';
        let stderr = '';
        
        child.stdout.on('data', async (data) => {
            const output = data.toString();
            stdout += output;
            console.log(output);
            
            try {
                if (output.includes('Step 1:')) {
                    await updateProgress(interaction, 'メールアドレス生成中', 10);
                } else if (output.includes('Step 5:')) {
                    await updateProgress(interaction, 'アカウント作成開始', 40);
                } else if (output.includes('Step 6:')) {
                    await updateProgress(interaction, 'パスワード設定中', 50);
                } else if (output.includes('Step 8:')) {
                    await updateProgress(interaction, '検証コード待機中', 60);
                } else if (output.includes('Step 9:')) {
                    await updateProgress(interaction, '検証コード入力中', 70);
                } else if (output.includes('Step 10:')) {
                    await updateProgress(interaction, 'プロフィール設定中', 80);
                } else if (output.includes('Step 11:')) {
                    await updateProgress(interaction, '生年月日設定中', 85);
                } else if (output.includes('Step 13:') || output.includes('Finish creating account')) {
                    await updateProgress(interaction, 'アカウント作成完了処理中', 88);
                } else if (output.includes('create-free-workspace')) {
                    await updateProgress(interaction, 'ワークスペース設定中', 92);
                } else if (output.includes('サインアップ完了')) {
                    await updateProgress(interaction, '完了！', 98);
                }
            } catch (e) {
                // 更新エラーは無視
            }
        });
        
        child.stderr.on('data', (data) => {
            stderr += data.toString();
            console.error(data.toString());
        });
        
        child.on('close', (code) => {
            const result = parseResult(stdout);
            
            if (result.email && result.password) {
                resolve(result);
            } else {
                reject(new Error('アカウント情報の取得に失敗しました'));
            }
        });
        
        child.on('error', (error) => {
            reject(error);
        });
    });
}

// 出力からアカウント情報を抽出
function parseResult(output) {
    const result = {
        email: null,
        password: null,
        name: null
    };
    
    const emailMatch = output.match(/Email:\s*(user\d+@[\w.]+)/);
    if (emailMatch) result.email = emailMatch[1];
    
    const passMatch = output.match(/Password:\s*(Pass\w+)/);
    if (passMatch) result.password = passMatch[1];
    
    const nameMatch = output.match(/名前入力完了:\s*([\w\s.]+)/);
    if (nameMatch) result.name = nameMatch[1].trim();
    
    return result;
}

client.login(TOKEN);
