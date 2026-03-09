        // Step 16: PayPalタブを選択
        console.log('\n💰 Step 16: PayPalタブを選択');
        await page.waitForSelector('[data-testid="paypal"]', {
            visible: true,
            timeout: 30000
        });
        
        await page.evaluate(() => {
            const paypalTab = document.querySelector('[data-testid="paypal"]');
            if (paypalTab) paypalTab.click();
        });
        console.log('   ✅ PayPalタブを選択しました');
        await sleep(randomDelay(3000, 5000));
        
        // Step 17: 請求先住所入力（フランスの住所）
        console.log('\n🏠 Step 17: 請求先住所入力');
        
        // フランスの住所を生成
        const frenchAddress = generateFrenchAddress();
        console.log(`   生成した住所: ${frenchAddress.street}, ${frenchAddress.city}, ${frenchAddress.postalCode}`);
        
        // 名前入力
        const nameInput = await page.waitForSelector('#billingAddress-nameInput', {
            visible: true,
            timeout: 15000
        });
        await nameInput.click();
        await nameInput.type('Chihalu', { delay: 0 });
        console.log('   ✅ 名前入力完了');
        await sleep(randomDelay(500, 1000));
        
        // 住所1入力
        const address1Input = await page.waitForSelector('#billingAddress-addressLine1Input', {
            visible: true,
            timeout: 15000
        });
        await address1Input.click();
        await address1Input.type(frenchAddress.street, { delay: 0 });
        console.log('   ✅ 住所1入力完了');
        await sleep(randomDelay(500, 1000));
        
        // 郵便番号入力
        const postalCodeInput = await page.waitForSelector('#billingAddress-postalCodeInput', {
            visible: true,
            timeout: 15000
        });
        await postalCodeInput.click();
        await postalCodeInput.click({ clickCount: 3 }); // 既存の値を選択
        await postalCodeInput.type(frenchAddress.postalCode, { delay: 0 });
        console.log('   ✅ 郵便番号入力完了');
        await sleep(randomDelay(500, 1000));
        
        // 都市入力
        const cityInput = await page.waitForSelector('#billingAddress-localityInput', {
            visible: true,
            timeout: 15000
        });
        await cityInput.click();
        await cityInput.type(frenchAddress.city, { delay: 0 });
        console.log('   ✅ 都市入力完了');
        await sleep(randomDelay(500, 1000));
        
        // Step 18: 購読するボタンをクリック
        console.log('\n✅ Step 18: 購読するボタンをクリック');
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const subscribeBtn = buttons.find(b => {
                const text = b.textContent.trim();
                return text.includes('購読する') || 
                       text.includes('Subscribe') ||
                       text.toLowerCase().includes('subscribe');
            });
            if (subscribeBtn) subscribeBtn.click();
        });
        console.log('   ✅ 購読するボタンをクリックしました');
        await sleep(randomDelay(5000, 8000));
        
        // Step 19: PayPal同意ボタン
        console.log('\n💳 Step 19: PayPal同意ボタン');
        await page.waitForSelector('#consentButton', {
            visible: true,
            timeout: 30000
        });
        
        await page.evaluate(() => {
            const consentBtn = document.querySelector('#consentButton');
            if (consentBtn) consentBtn.click();
        });
        console.log('   ✅ PayPal同意ボタンをクリックしました');
        await sleep(randomDelay(5000, 8000));
        
        // Step 20: Payment successful確認
        console.log('\n✅ Step 20: 支払い成功確認');
        let paymentSuccess = false;
        for (let i = 0; i < 10; i++) {
            paymentSuccess = await page.evaluate(() => {
                const heading = document.querySelector('h2');
                return heading && heading.textContent.includes('Payment successful');
            });
            
            if (paymentSuccess) {
                console.log('   ✅ Payment successful を確認しました');
                break;
            }
            await sleep(2000);
        }
        
        if (!paymentSuccess) {
            console.log('   ⚠️ Payment successful が確認できませんでしたが、続行します');
        }
        
        // Step 21: Continueボタン
        console.log('\n➡️ Step 21: Continueボタン');
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const continueBtn = buttons.find(b => {
                const text = b.textContent.trim();
                return text.includes('Continue') || text.includes('続行');
            });
            if (continueBtn) continueBtn.click();
        });
        console.log('   ✅ Continueボタンをクリックしました');
        await sleep(randomDelay(4000, 6000));
        
        // Step 22: Workspace名入力
        console.log('\n🏢 Step 22: Workspace名入力');
        const workspaceInput = await page.waitForSelector('input[name="workspace-name"]', {
            visible: true,
            timeout: 15000
        });
        await workspaceInput.click();
        await workspaceInput.type('User', { delay: 0 });
        console.log('   ✅ Workspace名入力完了');
        await sleep(randomDelay(500, 1000));
        
        // Continueボタン
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const continueBtn = buttons.find(b => {
                const text = b.textContent.trim();
                return text.includes('Continue') || text.includes('続行');
            });
            if (continueBtn) continueBtn.click();
        });
        console.log('   ✅ Continueボタンをクリックしました');
        await sleep(randomDelay(5000, 8000));
        
        // Step 23: サブスクリプションキャンセル
        console.log('\n❌ Step 23: サブスクリプションキャンセル');
        
        // /admin/billing に移動
        await page.goto('https://chatgpt.com/admin/billing', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });
        await sleep(randomDelay(4000, 6000));
        console.log('   ✅ 請求ページに移動しました');
        
        // Manage plan ボタンをクリック
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const manageBtn = buttons.find(b => {
                const text = b.textContent.trim();
                return text.includes('Manage plan') || text.includes('プラン管理');
            });
            if (manageBtn) manageBtn.click();
        });
        console.log('   ✅ Manage planボタンをクリックしました');
        await sleep(randomDelay(3000, 5000));
        
        // Cancel subscription をクリック
        await page.evaluate(() => {
            const menuItems = Array.from(document.querySelectorAll('[role="menuitem"]'));
            const cancelItem = menuItems.find(item => {
                const text = item.textContent.trim();
                return text.includes('Cancel subscription') || text.includes('サブスクリプションをキャンセル');
            });
            if (cancelItem) cancelItem.click();
        });
        console.log('   ✅ Cancel subscriptionをクリックしました');
        await sleep(randomDelay(3000, 5000));
        
        // メールアドレス入力
        const emailConfirmInput = await page.waitForSelector('#user-email', {
            visible: true,
            timeout: 15000
        });
        await emailConfirmInput.click();
        await emailConfirmInput.type(account.email, { delay: 0 });
        console.log('   ✅ メールアドレス入力完了');
        await sleep(randomDelay(500, 1000));
        
        // Cancel subscription ボタンをクリック
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const cancelBtn = buttons.find(b => {
                const text = b.textContent.trim();
                return text.includes('Cancel subscription') || text.includes('サブスクリプションをキャンセル');
            });
            if (cancelBtn) cancelBtn.click();
        });
        console.log('   ✅ サブスクリプションをキャンセルしました');
        await sleep(randomDelay(5000, 8000));
        
        console.log('\n✅ チームプラン登録・キャンセルフロー完了');
