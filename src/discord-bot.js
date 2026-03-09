/**
 * Discord Bot - ChatGPTサインアップ自動化 (Firefox/Chrome自動切り替え)
 * Slash Command: /create-account
 */

const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require('discord.js');
const { spawn } = require('child_process');
const path = require('path');

require('dotenv').config();

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
        .setDescription('ChatGPTアカウントを自動作成します (Firefox/Chrome自動切り替え)')
        .toJSON(),
    new SlashCommandBuilder()
        .setName('paypal-login')
        .setDescription('PayPalに手動でログインします（ブラウザが開いたまま維持されます）')
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
    
    if (interaction.commandName === 'paypal-login') {
        await handlePayPalLogin(interaction);
    }
});

// アカウント作成処理
async function handleCreateAccount(interaction) {
    // 即座に応答
    const initialEmbed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('🚀 ChatGPTアカウント作成中')
        .setDescription('⏳ ブラウザを検出しています...')
        .setTimestamp();
    
    await interaction.reply({ 
        embeds: [initialEmbed], 
        flags: 64 
    });
    
    try {
        await updateProgress(interaction, '準備中...', 0);
        
        // Unifiedスクリプトを実行
        const result = await runSignupScript(interaction, updateProgress);
        
        // ブラウザアイコン選択
        const browserEmoji = {
            'brave': '🦁',
            'chrome': '🌐'
        }[result.browser] || '🌐';
        
        // 完了メッセージ
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle(`${browserEmoji} アカウント作成完了！`)
            .addFields(
                { name: '📧 Email', value: `\`${result.email}\``, inline: false },
                { name: '🔑 Password', value: `\`${result.password}\``, inline: false },
                { name: '👤 Name', value: result.name || '-', inline: false }
            )
            .setFooter({ text: `使用ブラウザ: ${result.browser} | ⚠️ この情報は他の人に見せないでください` })
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
            
            await interaction.editReply({
                content: null,
                embeds: [errorEmbed]
            });
        } catch (e) {
            console.error('Discord応答エラー:', e);
        }
    }
}

// Puppeteerスクリプト実行関数
function runSignupScript(interaction, updateProgress) {
    return new Promise((resolve, reject) => {
        const nodePath = '/opt/homebrew/bin/node';
        const scriptPath = path.join(__dirname, 'puppeteer_unified.js');
        
        const child = spawn(nodePath, [scriptPath], {
            env: { 
                ...process.env, 
                PATH: '/opt/homebrew/bin:' + process.env.PATH,
                HEADLESS: process.env.HEADLESS || 'false'
            },
            timeout: 300000 // 5分タイムアウト
        });
        
        let stdout = '';
        let stderr = '';
        
        child.stdout.on('data', async (data) => {
            const output = data.toString();
            stdout += output;
            console.log(output);
            
            try {
                if (output.includes('Step 1:') || output.includes('mail.tmアカウント作成')) {
                    await updateProgress(interaction, 'メールアドレス生成中', 10);
                } else if (output.includes('Brave を起動中') || output.includes('Chrome を起動中')) {
                    await updateProgress(interaction, 'ブラウザ起動中', 20);
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
                } else if (output.includes('Step 13:')) {
                    await updateProgress(interaction, 'アカウント作成完了処理中', 90);
                } else if (output.includes('使用ブラウザ:')) {
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
                reject(new Error('アカウント情報の取得に失敗しました\n' + stderr));
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
        name: null,
        browser: null
    };
    
    const emailMatch = output.match(/Email:\s*(user\d+@[\w.]+)/);
    if (emailMatch) result.email = emailMatch[1];
    
    const passMatch = output.match(/Password:\s*(Pass\S+)/);
    if (passMatch) result.password = passMatch[1];
    
    const nameMatch = output.match(/Name:\s*([\w\s.]+)/);
    if (nameMatch) result.name = nameMatch[1].trim();
    
    const browserMatch = output.match(/使用ブラウザ:\s*(\w+)/);
    if (browserMatch) result.browser = browserMatch[1];
    
    return result;
}

// PayPalログイン処理
async function handlePayPalLogin(interaction) {
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('💳 PayPalログイン')
        .setDescription('ブラウザを開いてPayPalログインページに移動します...\n\n⚠️ **手動でログインしてください**\nログイン後、ブラウザは開いたまま維持されます。')
        .setTimestamp();
    
    await interaction.reply({ 
        embeds: [embed], 
        flags: 64 
    });
    
    try {
        // puppeteer_paypal.js を実行
        const nodePath = '/opt/homebrew/bin/node';
        const scriptPath = path.join(__dirname, 'puppeteer_paypal.js');
        
        const child = spawn(nodePath, [scriptPath], {
            env: { 
                ...process.env, 
                PATH: '/opt/homebrew/bin:' + process.env.PATH,
                HEADLESS: 'false'
            },
            detached: true, // 親プロセスから切り離す
            stdio: 'ignore'
        });
        
        child.unref(); // 親プロセスが終了しても子プロセスを維持
        
        // 完了メッセージ
        const successEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ PayPalログインページを開きました')
            .setDescription('ブラウザが開き、PayPalログインページに移動しました。\n\n👆 **手順:**\n1. ブラウザでPayPalにログインしてください\n2. ログイン状態は維持されます\n3. 完了したらこのメッセージは無視してOKです')
            .setTimestamp();
        
        await interaction.editReply({
            embeds: [successEmbed]
        });
        
    } catch (error) {
        console.error('❌ PayPalログインエラー:', error);
        
        const errorEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ エラーが発生しました')
            .setDescription(`\`\`\`${error.message}\`\`\``)
            .setTimestamp();
        
        await interaction.editReply({
            embeds: [errorEmbed]
        });
    }
}

client.login(TOKEN);
