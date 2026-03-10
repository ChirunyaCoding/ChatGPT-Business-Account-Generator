/**
 * Discordコマンド全削除スクリプト
 * 廃止コマンドを含むすべてのスラッシュコマンドを削除します
 */

const { REST, Routes } = require('discord.js');
require('dotenv').config();

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!TOKEN || !CLIENT_ID) {
    console.error('❌ DISCORD_TOKEN または DISCORD_CLIENT_ID が設定されていません');
    process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('🗑️ スラッシュコマンドを削除中...\n');

        // 1. ギルドコマンドを削除
        if (GUILD_ID) {
            console.log(`🔍 サーバー ${GUILD_ID} のコマンドを確認中...`);
            
            try {
                const guildCommands = await rest.get(
                    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
                );
                
                console.log(`   見つかったコマンド数: ${guildCommands.length}`);
                
                for (const command of guildCommands) {
                    console.log(`   🗑️ 削除: /${command.name}`);
                    await rest.delete(
                        Routes.applicationGuildCommand(CLIENT_ID, GUILD_ID, command.id)
                    );
                }
                
                // ギルドコマンドを全削除（一括削除）
                await rest.put(
                    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
                    { body: [] }
                );
                console.log('   ✅ サーバーコマンドを全削除しました\n');
            } catch (error) {
                console.error('   ⚠️ サーバーコマンド削除エラー:', error.message);
            }
        }

        // 2. グローバルコマンドを削除
        console.log('🌐 グローバルコマンドを確認中...');
        
        try {
            const globalCommands = await rest.get(
                Routes.applicationCommands(CLIENT_ID)
            );
            
            console.log(`   見つかったコマンド数: ${globalCommands.length}`);
            
            for (const command of globalCommands) {
                console.log(`   🗑️ 削除: /${command.name}`);
                await rest.delete(
                    Routes.applicationCommand(CLIENT_ID, command.id)
                );
            }
            
            // グローバルコマンドを全削除（一括削除）
            await rest.put(
                Routes.applicationCommands(CLIENT_ID),
                { body: [] }
            );
            console.log('   ✅ グローバルコマンドを全削除しました\n');
        } catch (error) {
            console.error('   ⚠️ グローバルコマンド削除エラー:', error.message);
        }

        console.log('✅ すべてのコマンド削除が完了しました');
        console.log('💡 次に Bot を起動して新しいコマンドを登録してください');
        console.log('   node src/discord-bot.js\n');
        
        console.log('⚠️ 注意: グローバルコマンドは反映に最大1時間かかる場合があります');
        console.log('   すぐに反映させたい場合は、サーバー固有のコマンドを使用してください\n');

    } catch (error) {
        console.error('❌ エラー:', error);
        process.exit(1);
    }
})();
