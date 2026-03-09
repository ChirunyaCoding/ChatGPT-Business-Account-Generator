"""
VPN拡張機能管理ヘルパー
Chrome拡張機能（VPN）の設定と管理を行う
"""
import asyncio
import logging
from typing import Optional
from playwright.async_api import Page

logger = logging.getLogger(__name__)


class VPNManager:
    """VPN拡張機能管理クラス"""
    
    def __init__(self, page: Page, extension_id: str):
        self.page = page
        self.extension_id = extension_id
        self.extension_url = f"chrome-extension://{extension_id}/"
        
    async def open_extension_popup(self) -> bool:
        """
        拡張機能のポップアップを開く
        
        Returns:
            成功したかどうか
        """
        try:
            # 拡張機能のページを開く
            await self.page.goto(f"{self.extension_url}popup.html")
            await asyncio.sleep(2)
            logger.info("拡張機能ポップアップを開きました")
            return True
        except Exception as e:
            logger.error(f"拡張機能ポップアップを開けませんでした: {e}")
            return False
    
    async def connect_to_france(self) -> bool:
        """
        VPNをフランスに接続
        
        Returns:
            成功したかどうか
        """
        try:
            # 拡張機能のUIに依存するため、一般的な実装
            # 実際の拡張機能に合わせて調整が必要
            
            # 国選択ドロップダウンまたはボタンを探す
            country_selectors = [
                'select[name="country"]',
                'select[id="country"]',
                '[data-testid="country-select"]',
                '.country-selector',
                '#location-select',
            ]
            
            country_found = False
            for selector in country_selectors:
                try:
                    if await self.page.locator(selector).count() > 0:
                        await self.page.select_option(selector, "France")
                        country_found = True
                        logger.info(f"国を選択: France (selector: {selector})")
                        break
                except:
                    continue
            
            if not country_found:
                # テキストベースで探す
                try:
                    await self.page.get_by_text("France").click()
                    country_found = True
                    logger.info("国を選択: France (by text)")
                except:
                    pass
            
            # 接続ボタンを探す
            connect_selectors = [
                'button:has-text("Connect")',
                'button:has-text("接続")',
                'button[id="connect"]',
                'button[data-action="connect"]',
                '.connect-button',
                '#connect-btn',
            ]
            
            for selector in connect_selectors:
                try:
                    if await self.page.locator(selector).count() > 0:
                        await self.page.click(selector)
                        logger.info(f"接続ボタンをクリック: {selector}")
                        await asyncio.sleep(5)  # 接続待機
                        return True
                except:
                    continue
            
            logger.warning("接続ボタンが見つかりませんでした")
            return False
            
        except Exception as e:
            logger.error(f"VPN接続エラー: {e}")
            return False
    
    async def is_connected(self) -> bool:
        """
        VPN接続状態を確認
        
        Returns:
            接続されているかどうか
        """
        try:
            # 接続状態を示す要素を探す
            status_selectors = [
                '.connected',
                '[data-status="connected"]',
                '.status-connected',
                '#status:has-text("Connected")',
            ]
            
            for selector in status_selectors:
                try:
                    if await self.page.locator(selector).count() > 0:
                        is_visible = await self.page.locator(selector).is_visible()
                        if is_visible:
                            logger.info("VPN接続状態: 接続済み")
                            return True
                except:
                    continue
            
            return False
            
        except Exception as e:
            logger.error(f"接続状態確認エラー: {e}")
            return False
    
    async def disconnect(self) -> bool:
        """
        VPN接続を切断
        
        Returns:
            成功したかどうか
        """
        try:
            disconnect_selectors = [
                'button:has-text("Disconnect")',
                'button:has-text("切断")',
                'button[id="disconnect"]',
            ]
            
            for selector in disconnect_selectors:
                try:
                    if await self.page.locator(selector).count() > 0:
                        await self.page.click(selector)
                        logger.info("VPNを切断しました")
                        await asyncio.sleep(2)
                        return True
                except:
                    continue
            
            return False
            
        except Exception as e:
            logger.error(f"VPN切断エラー: {e}")
            return False
    
    async def get_current_ip(self) -> Optional[str]:
        """
        現在のIPアドレスを取得
        
        Returns:
            IPアドレスまたはNone
        """
        try:
            # 新しいページでIP確認サービスにアクセス
            ip_page = await self.page.context.new_page()
            await ip_page.goto("https://api.ipify.org?format=json")
            await asyncio.sleep(2)
            
            # ページの内容を取得
            content = await ip_page.content()
            await ip_page.close()
            
            # JSONからIPを抽出
            import json
            import re
            
            json_match = re.search(r'\{[^}]+\}', content)
            if json_match:
                data = json.loads(json_match.group())
                ip = data.get("ip")
                logger.info(f"現在のIP: {ip}")
                return ip
            
            return None
            
        except Exception as e:
            logger.error(f"IP取得エラー: {e}")
            return None


async def setup_vpn_with_extension(page: Page, extension_path: str) -> bool:
    """
    拡張機能を使用してVPNをセットアップ
    
    Args:
        page: Playwrightページ
        extension_path: 拡張機能のパス
        
    Returns:
        成功したかどうか
    """
    # 拡張機能IDを抽出
    import re
    match = re.search(r'Extensions/([a-z]+)', extension_path)
    if not match:
        logger.error("拡張機能IDを抽出できませんでした")
        return False
    
    extension_id = match.group(1)
    
    # VPNマネージャーを作成
    vpn = VPNManager(page, extension_id)
    
    # 拡張機能を開く
    if not await vpn.open_extension_popup():
        return False
    
    # フランスに接続
    if await vpn.connect_to_france():
        # 接続確認
        await asyncio.sleep(5)
        if await vpn.is_connected():
            ip = await vpn.get_current_ip()
            logger.info(f"VPN接続成功！ IP: {ip}")
            return True
    
    return False
