"""
人間の行動を模倣するモジュール
"""
import asyncio
import random
import math
from typing import Tuple

class HumanBehavior:
    """人間らしい動作をシミュレート"""
    
    @staticmethod
    async def human_like_typing(page, selector: str, text: str):
        """人間らしいタイピング（ミスタイプあり）"""
        for char in text:
            # 80%の確率で正しく入力、20%でミスタイプして削除
            if random.random() < 0.95:
                await page.type(selector, char, delay=random.randint(50, 150))
            else:
                # ミスタイプして削除
                wrong_char = random.choice('abcdefghijklmnopqrstuvwxyz')
                await page.type(selector, wrong_char, delay=random.randint(30, 80))
                await asyncio.sleep(random.uniform(0.1, 0.3))
                await page.press(selector, 'Backspace')
                await asyncio.sleep(random.uniform(0.05, 0.1))
                await page.type(selector, char, delay=random.randint(50, 150))
            
            # 時々長めのポーズ
            if random.random() < 0.1:
                await asyncio.sleep(random.uniform(0.2, 0.5))
    
    @staticmethod
    async def bezier_curve_movement(page, start: Tuple[int, int], end: Tuple[int, int], steps: int = 20):
        """ベジェ曲線でマウスを移動（人間らしい動き）"""
        # 制御点をランダムに設定
        cp1 = (
            start[0] + (end[0] - start[0]) * 0.3 + random.randint(-100, 100),
            start[1] + (end[1] - start[1]) * 0.1 + random.randint(-50, 50)
        )
        cp2 = (
            start[0] + (end[0] - start[0]) * 0.7 + random.randint(-100, 100),
            start[1] + (end[1] - start[1]) * 0.9 + random.randint(-50, 50)
        )
        
        points = []
        for t in range(steps + 1):
            t /= steps
            # 3次ベジェ曲線
            x = (1-t)**3 * start[0] + 3*(1-t)**2*t * cp1[0] + 3*(1-t)*t**2 * cp2[0] + t**3 * end[0]
            y = (1-t)**3 * start[1] + 3*(1-t)**2*t * cp1[1] + 3*(1-t)*t**2 * cp2[1] + t**3 * end[1]
            points.append((x, y))
        
        for point in points:
            await page.mouse.move(point[0], point[1])
            await asyncio.sleep(random.uniform(0.01, 0.03))
    
    @staticmethod
    async def human_like_click(page, element):
        """人間らしいクリック（ホバー→少し揺れ→クリック）"""
        box = await element.bounding_box()
        if not box:
            return False
        
        # ターゲット位置（要素の中心付近、少しランダムに）
        target_x = box['x'] + box['width']/2 + random.randint(-5, 5)
        target_y = box['y'] + box['height']/2 + random.randint(-3, 3)
        
        # 現在のマウス位置を取得（デフォルトは左上）
        current_x, current_y = random.randint(100, 300), random.randint(100, 300)
        
        # ベジェ曲線で移動
        await HumanBehavior.bezier_curve_movement(page, (current_x, current_y), (target_x, target_y))
        
        # 少しホバー（人間はクリック前に一瞬止まる）
        await asyncio.sleep(random.uniform(0.1, 0.3))
        
        # 微かな揺れ（手の震え）
        for _ in range(random.randint(1, 3)):
            await page.mouse.move(
                target_x + random.randint(-2, 2),
                target_y + random.randint(-2, 2)
            )
            await asyncio.sleep(random.uniform(0.02, 0.05))
        
        # クリック
        await page.mouse.click(target_x, target_y, delay=random.randint(50, 150))
        
        return True
    
    @staticmethod
    async def human_like_scroll(page, amount: int = None):
        """人間らしいスクロール"""
        if amount is None:
            amount = random.randint(300, 700)
        
        # スクロールを段階的に行う
        scrolled = 0
        while scrolled < amount:
            step = random.randint(50, 150)
            await page.mouse.wheel(0, step)
            scrolled += step
            # スクロール間の待機（人間はスクロールして止まって読む）
            await asyncio.sleep(random.uniform(0.1, 0.4))
    
    @staticmethod
    async def random_mouse_movements(page, count: int = 3):
        """ランダムなマウス移動（ページ上をうろつく）"""
        viewport = page.viewport_size
        for _ in range(count):
            x = random.randint(100, viewport['width'] - 100)
            y = random.randint(100, viewport['height'] - 100)
            await HumanBehavior.bezier_curve_movement(
                page,
                (random.randint(0, viewport['width']), random.randint(0, viewport['height'])),
                (x, y),
                steps=random.randint(10, 20)
            )
            await asyncio.sleep(random.uniform(0.2, 0.5))


# 使用例
async def example_usage():
    """使用例"""
    from playwright.async_api import async_playwright
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page(viewport={'width': 1920, 'height': 1080})
        
        await page.goto('https://example.com')
        
        # ランダムなマウス移動（ページを見ているふり）
        await HumanBehavior.random_mouse_movements(page, count=2)
        
        # 入力欄を探してタイピング
        input_field = await page.query_selector('input')
        if input_field:
            # まず人間らしくクリック
            await HumanBehavior.human_like_click(page, input_field)
            # 人間らしくタイプ
            await HumanBehavior.human_like_typing(page, 'input', "test@example.com")
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(example_usage())
