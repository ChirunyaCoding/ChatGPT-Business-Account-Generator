const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const MANAGED_PROFILE_ROOT_DIRNAME = 'delete';

function detectBrowserPaths(options = {}) {
    const env = options.env || process.env;
    const platform = options.platform || process.platform;
    const existsSync = options.existsSync || fs.existsSync;
    const homeDir = options.homeDir || os.homedir();
    const forceBrowser = env.FORCE_BROWSER;
    const isMac = platform === 'darwin';
    const isWindows = platform === 'win32';
    const paths = {
        brave: null,
        chrome: null
    };
    const pathModule = isWindows ? path.win32 : path.posix;

    const bravePaths = [
        env.BRAVE_PATH,
        ...(isMac ? [
            '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
            '/usr/bin/brave-browser'
        ] : []),
        ...(isWindows ? [
            'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
            'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
        ] : [])
    ];

    for (const candidatePath of bravePaths) {
        if (candidatePath && existsSync(candidatePath)) {
            paths.brave = candidatePath;
            break;
        }
    }

    const chromePaths = [
        env.CHROME_PATH,
        ...(isMac ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/usr/bin/google-chrome'
        ] : []),
        ...(isWindows ? [
            pathModule.join(homeDir, 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
        ] : [])
    ];

    for (const candidatePath of chromePaths) {
        if (candidatePath && existsSync(candidatePath) && !candidatePath.toLowerCase().includes('dev')) {
            paths.chrome = candidatePath;
            break;
        }
    }

    if (forceBrowser === 'brave' && paths.brave) {
        return { brave: paths.brave, chrome: null };
    }

    if (forceBrowser === 'chrome' && paths.chrome) {
        return { brave: null, chrome: paths.chrome };
    }

    return paths;
}

function getChromeProfilePath(options = {}) {
    const platform = options.platform || process.platform;
    const homeDir = options.homeDir || os.homedir();
    const pathModule = platform === 'win32' ? path.win32 : path.posix;

    if (platform === 'win32') {
        return pathModule.join(homeDir, 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
    }

    if (platform === 'darwin') {
        return pathModule.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome');
    }

    return pathModule.join(homeDir, '.config', 'google-chrome');
}

function copyFileIfExists(sourcePath, destinationPath) {
    if (!fs.existsSync(sourcePath)) {
        return false;
    }

    try {
        fs.copyFileSync(sourcePath, destinationPath);
        return true;
    } catch (error) {
        return false;
    }
}

function resolveManagedProfileBaseDir(options = {}) {
    const baseDir = options.baseDir;
    const managedRootDirName = options.managedRootDirName || MANAGED_PROFILE_ROOT_DIRNAME;

    if (!baseDir) {
        return null;
    }

    return path.join(baseDir, managedRootDirName);
}

function ensureManagedProfileBaseDir(options = {}) {
    const managedBaseDir = resolveManagedProfileBaseDir(options);
    if (!managedBaseDir) {
        return null;
    }

    fs.mkdirSync(managedBaseDir, { recursive: true });
    return managedBaseDir;
}

function setupRealChromeProfileCopy(options = {}) {
    const baseDir = options.baseDir;
    const copyDirName = options.copyDirName || '.chrome_real_profile_copy';
    const realProfilePath = getChromeProfilePath(options);
    const managedBaseDir = ensureManagedProfileBaseDir(options);
    const copiedProfilePath = managedBaseDir ? path.join(managedBaseDir, copyDirName) : null;
    const defaultDir = path.join(realProfilePath, 'Default');
    const copiedDefaultDir = path.join(copiedProfilePath, 'Default');
    const filesToCopy = [
        'Cookies',
        'Cookies-journal',
        'Login Data',
        'Login Data-journal',
        'Preferences',
        'Secure Preferences'
    ];

    if (!baseDir || !managedBaseDir || !fs.existsSync(defaultDir)) {
        return null;
    }

    fs.mkdirSync(copiedDefaultDir, { recursive: true });

    let copiedCount = 0;
    for (const fileName of filesToCopy) {
        const copied = copyFileIfExists(
            path.join(defaultDir, fileName),
            path.join(copiedDefaultDir, fileName)
        );
        if (copied) {
            copiedCount += 1;
        }
    }

    copyFileIfExists(
        path.join(realProfilePath, 'Local State'),
        path.join(copiedProfilePath, 'Local State')
    );

    return {
        copiedCount,
        profilePath: copiedProfilePath
    };
}

function createTemporaryProfilePath(options = {}) {
    const managedBaseDir = ensureManagedProfileBaseDir(options);
    const profilePrefix = options.profilePrefix || 'browser_tmp';
    const browserType = options.browserType || 'browser';
    const uniqueSuffix = `${Date.now()}_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
    return path.join(managedBaseDir, `.${profilePrefix}_${browserType}_${uniqueSuffix}`);
}

function createChromeProfileCopyDirName(profilePrefix = 'browser_tmp') {
    return `.${profilePrefix}_real_chrome_profile_copy_${Date.now()}_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
}

function isManagedProfileDirectoryName(dirName, profilePrefix = 'browser_tmp') {
    if (!dirName) {
        return false;
    }

    const managedPrefixes = [
        `.${profilePrefix}_real_chrome_profile_copy_`,
        `.${profilePrefix}_chrome_`,
        `.${profilePrefix}_brave_`
    ];

    return managedPrefixes.some((prefix) => dirName.startsWith(prefix));
}

function listManagedProfileDirectories(options = {}) {
    const baseDir = options.baseDir;
    const profilePrefix = options.profilePrefix || 'browser_tmp';
    const readdirSync = options.readdirSync || fs.readdirSync;
    const statSync = options.statSync || fs.statSync;
    const searchDirs = [
        resolveManagedProfileBaseDir(options),
        baseDir
    ].filter((dir, index, dirs) => dir && dirs.indexOf(dir) === index && fs.existsSync(dir));

    const results = [];

    for (const searchDir of searchDirs) {
        const directories = readdirSync(searchDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && isManagedProfileDirectoryName(entry.name, profilePrefix))
            .map((entry) => {
                const profilePath = path.join(searchDir, entry.name);
                const stats = statSync(profilePath);
                return {
                    name: entry.name,
                    path: profilePath,
                    mtimeMs: stats.mtimeMs
                };
            });

        results.push(...directories);
    }

    return results;
}

function removeDirectoryIfExists(targetPath, options = {}) {
    const rmSync = options.rmSync || fs.rmSync;

    if (!targetPath || !fs.existsSync(targetPath)) {
        return false;
    }

    try {
        rmSync(targetPath, {
            recursive: true,
            force: true,
            maxRetries: 5,
            retryDelay: 200
        });
        return true;
    } catch (error) {
        return false;
    }
}

function cleanupStaleProfileDirectories(options = {}) {
    const baseDir = options.baseDir;
    const profilePrefix = options.profilePrefix || 'browser_tmp';
    const maxAgeMs = options.maxAgeMs ?? (30 * 60 * 1000);
    const nowMs = options.nowMs ?? Date.now();
    const log = options.log || (() => undefined);
    const cleanedPaths = [];

    for (const profileDir of listManagedProfileDirectories({
        baseDir,
        profilePrefix,
        readdirSync: options.readdirSync,
        statSync: options.statSync
    })) {
        if (nowMs - profileDir.mtimeMs < maxAgeMs) {
            continue;
        }

        if (removeDirectoryIfExists(profileDir.path, options)) {
            cleanedPaths.push(profileDir.path);
        }
    }

    if (cleanedPaths.length > 0) {
        log(`  🧹 古い一時プロファイルを ${cleanedPaths.length} 件削除しました`);
    }

    return cleanedPaths;
}

function attachManagedProfileCleanup(browser, userDataDir, options = {}) {
    if (!browser || !userDataDir) {
        return browser;
    }

    const log = options.log || (() => undefined);
    let cleaned = false;

    browser.once('disconnected', () => {
        if (cleaned) {
            return;
        }

        cleaned = true;
        const removed = removeDirectoryIfExists(userDataDir, options);
        if (removed) {
            log(`  🧹 一時プロファイルを削除しました: ${path.basename(userDataDir)}`);
        }
    });

    return browser;
}

function scheduleManagedProfileCleanupAfterExit(userDataDir, processId, options = {}) {
    if (!userDataDir || !Number.isInteger(processId) || processId <= 0) {
        return false;
    }

    try {
        const cleanupScript = `
const fs = require('fs');
const pid = ${JSON.stringify(processId)};
const targetDir = ${JSON.stringify(userDataDir)};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function main() {
    while (true) {
        try {
            process.kill(pid, 0);
            await sleep(1000);
        } catch (error) {
            if (error && error.code === 'EPERM') {
                await sleep(1000);
                continue;
            }
            break;
        }
    }
    try {
        fs.rmSync(targetDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (error) {
        // cleanup 失敗は無視
    }
}
main().finally(() => process.exit(0));
`;

        const cleanupProcess = spawn(process.execPath, ['-e', cleanupScript], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true
        });
        cleanupProcess.unref();
        return true;
    } catch (error) {
        return false;
    }
}

function getPreferredBrowserCandidates(browserPaths = {}) {
    return [
        { type: 'chrome', path: browserPaths.chrome || null },
        { type: 'brave', path: browserPaths.brave || null }
    ].filter((browser) => browser.path);
}

function getChromeOnlyBrowserCandidates(browserPaths = {}) {
    return [
        { type: 'chrome', path: browserPaths.chrome || null }
    ].filter((browser) => browser.path);
}

function createBrowserLaunchArguments(options = {}) {
    const userDataDir = options.userDataDir;
    const debuggingPort = options.debuggingPort;
    const extraArgs = Array.isArray(options.extraArgs) ? options.extraArgs : [];

    return [
        '--width=1920',
        '--height=1080',
        '--window-size=1920,1080',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        '--no-default-browser-check',
        ...(typeof debuggingPort === 'number' ? [`--remote-debugging-port=${debuggingPort}`] : []),
        ...(userDataDir ? [`--user-data-dir=${userDataDir}`] : []),
        ...extraArgs
    ];
}

function resolveBrowserProfileLaunchPlan(options = {}) {
    const browserType = options.browserType;
    const baseDir = options.baseDir;
    const profilePrefix = options.profilePrefix || 'browser_tmp';
    const preferRealChromeProfile = options.preferRealChromeProfile ?? true;
    const log = options.log || (() => undefined);

    cleanupStaleProfileDirectories({
        baseDir,
        profilePrefix,
        maxAgeMs: options.profileCleanupMaxAgeMs,
        log
    });

    if (browserType === 'chrome' && preferRealChromeProfile) {
        const profileCopy = setupRealChromeProfileCopy({
            baseDir,
            copyDirName: createChromeProfileCopyDirName(profilePrefix),
            platform: options.platform,
            homeDir: options.homeDir
        });

        if (profileCopy?.profilePath) {
            log(`  📁 実プロファイルから ${profileCopy.copiedCount} ファイルをコピーしました`);
            return {
                userDataDir: profileCopy.profilePath,
                extraArgs: ['--profile-directory=Default'],
                copiedCount: profileCopy.copiedCount
            };
        }
    }

    return {
        userDataDir: createTemporaryProfilePath({
            baseDir,
            profilePrefix,
            browserType
        }),
        extraArgs: [],
        copiedCount: 0
    };
}

function buildDetachedBrowserLaunchPlan(options = {}) {
    const profilePlan = resolveBrowserProfileLaunchPlan(options);
    const debuggingPort = options.debuggingPort;

    return {
        executablePath: options.browserPath,
        debuggingPort,
        userDataDir: profilePlan.userDataDir,
        args: createBrowserLaunchArguments({
            userDataDir: profilePlan.userDataDir,
            debuggingPort,
            extraArgs: profilePlan.extraArgs
        })
    };
}

function findFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            server.close(() => {
                if (address && typeof address === 'object') {
                    resolve(address.port);
                    return;
                }

                reject(new Error('空きポートの取得に失敗しました'));
            });
        });
    });
}

async function waitForBrowserWebSocketEndpoint(debuggingPort, timeout = 30000) {
    const start = Date.now();
    const endpointUrl = `http://127.0.0.1:${debuggingPort}/json/version`;

    while (Date.now() - start < timeout) {
        try {
            const response = await fetch(endpointUrl);
            if (response.ok) {
                const payload = await response.json();
                if (payload.webSocketDebuggerUrl) {
                    return payload.webSocketDebuggerUrl;
                }
            }
        } catch (error) {
            // 起動待ち中は無視
        }

        await new Promise((resolve) => setTimeout(resolve, 250));
    }

    throw new Error(`デバッグ用 WebSocket endpoint の取得に失敗しました: ${endpointUrl}`);
}

async function launchDetachedBrowserAndConnect(puppeteer, options = {}) {
    const timeout = options.timeout ?? 120000;
    const debuggingPort = options.debuggingPort ?? await findFreePort();
    const launchPlan = buildDetachedBrowserLaunchPlan({
        ...options,
        debuggingPort
    });

    const browserProcess = spawn(launchPlan.executablePath, launchPlan.args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: false
    });

    browserProcess.unref();
    scheduleManagedProfileCleanupAfterExit(
        launchPlan.userDataDir,
        browserProcess.pid,
        options
    );

    try {
        const browserWSEndpoint = await waitForBrowserWebSocketEndpoint(debuggingPort, timeout);
        return await puppeteer.connect({
            browserWSEndpoint,
            defaultViewport: null
        });
    } catch (error) {
        try {
            if (process.platform === 'win32') {
                spawn('taskkill', ['/pid', String(browserProcess.pid), '/T', '/F'], {
                    stdio: 'ignore',
                    windowsHide: true
                }).unref();
            } else {
                process.kill(-browserProcess.pid, 'SIGKILL');
            }
        } catch (cleanupError) {
            // cleanup 失敗は無視
        }

        removeDirectoryIfExists(launchPlan.userDataDir, options);

        throw error;
    }
}

async function launchRealBrowser(puppeteer, options = {}) {
    const browserType = options.browserType;
    const browserPath = options.browserPath;
    const slowMo = options.slowMo ?? 0;
    const timeout = options.timeout ?? 120000;
    const protocolTimeout = options.protocolTimeout ?? 120000;
    const commonOptions = {
        headless: false,
        executablePath: browserPath,
        slowMo,
        timeout,
        protocolTimeout,
        args: createBrowserLaunchArguments(),
        ignoreDefaultArgs: ['--enable-automation']
    };

    if (options.keepOpen) {
        return launchDetachedBrowserAndConnect(puppeteer, options);
    }

    const profilePlan = resolveBrowserProfileLaunchPlan(options);
    const launchConfig = {
        ...commonOptions,
        userDataDir: profilePlan.userDataDir,
        args: [...commonOptions.args, ...profilePlan.extraArgs]
    };

    try {
        const browser = await puppeteer.launch(launchConfig);
        return attachManagedProfileCleanup(browser, profilePlan.userDataDir, options);
    } catch (error) {
        removeDirectoryIfExists(profilePlan.userDataDir, options);
        throw error;
    }
}

module.exports = {
    attachManagedProfileCleanup,
    buildDetachedBrowserLaunchPlan,
    cleanupStaleProfileDirectories,
    createBrowserLaunchArguments,
    createChromeProfileCopyDirName,
    createTemporaryProfilePath,
    detectBrowserPaths,
    ensureManagedProfileBaseDir,
    getChromeOnlyBrowserCandidates,
    getPreferredBrowserCandidates,
    getChromeProfilePath,
    isManagedProfileDirectoryName,
    launchDetachedBrowserAndConnect,
    launchRealBrowser,
    listManagedProfileDirectories,
    removeDirectoryIfExists,
    resolveManagedProfileBaseDir,
    resolveBrowserProfileLaunchPlan,
    scheduleManagedProfileCleanupAfterExit,
    setupRealChromeProfileCopy
};
