/**
 * Puppeteer Extra + Stealth Plugin（シンプル版）
 * 実プロファイルなし、純粋にStealthの力で突破
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Stealth Pluginを有効化
puppeteer.use(StealthPlugin());

// 遅延関数
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function randomDelay(min, max) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await sleep(delay);
}

// メイン処理
async function testStealth() {
    console.log('🚀 Puppeteer Extra + Stealth Plugin（シンプル版）');
    console.log('========================================\n');
    
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
            '--window-size=1920,1080',
            '--start-maximized',
        ],
        ignoreDefaultArgs: ['--enable-automation']
    });
    
    console.log('✅ ブラウザ起動完了（Stealthモード）');
    
    const page = (await browser.pages())[0] || await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    try {
        // ChatGPTページへ
        console.log('\n🌐 ChatGPTページへ移動...');
        await page.goto('https://chatgpt.com', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        
        // 人間らしく待機
        await randomDelay(3000, 5000);
        
        // Turnstile検出
        console.log('\n🔒 Turnstileチェック中...');
        
        const turnstileFrame = await page.frames().find(f => 
            f.url().includes('challenges.cloudflare.com')
        );
        
        if (turnstileFrame) {
            console.log('⚠️  Turnstile検出！');
            console.log('   手動でチェックボックスをクリックしてください...');
            console.log('   （60秒待機します）\n');
            
            // iframeの位置を特定してクリック位置を案内
            const iframeHandle = await page.$('iframe[src*="challenges.cloudflare.com"]');
            if (iframeHandle) {
                const box = await iframeHandle.boundingBox();
                if (box) {
                    console.log(`   📍 チェックボックス位置: X=${Math.round(box.x + 20)}, Y=${Math.round(box.y + 32)}`);
                    console.log('   マウスをその位置に移動してクリックしてください\n');
                }
            }
            
            // 60秒待機
            for (let i = 0; i < 60; i++) {
                await sleep(1000);
                
                const stillThere = await page.frames().find(f => 
                    f.url().includes('challenges.cloudflare.com')
                );
                
                if (!stillThere) {
                    console.log('✅ Turnstile突破！\n');
                    break;
                }
                
                if (i % 10 === 0 && i > 0) {
                    console.log(`   ⏳ 待機中... ${i}秒経過`);
                }
            }
        } else {
            console.log('✅ Turnstileなし、または既に突破済み\n');
        }
        
        // ページの状態を確認
        const url = page.url();
        console.log(`📍 現在のURL: ${url}`);
        
        if (url.includes('chatgpt.com') && !url.includes('challenge')) {
            console.log('✅ 成功！ChatGPTにアクセスできました');
        } else {
            console.log('⚠️  確認が必要です');
        }
        
        // ブラウザは開いたまま
        console.log('\n💡 ブラウザは開いたままです');
        console.log('   確認後、手動で閉じてください');
        
    } catch (error) {
        console.error('❌ エラー:', error.message);
    }
}

// 実行
testStealth().catch(console.error);
