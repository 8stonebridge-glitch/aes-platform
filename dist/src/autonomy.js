function envFlag(name) {
    const value = process.env[name]?.trim().toLowerCase();
    return value === "1" || value === "true" || value === "yes" || value === "on";
}
export function isAutonomousBuild(state) {
    return !!state?.autonomous || envFlag("AES_AUTONOMOUS_MODE");
}
export function shouldAutoConfirmIntent(state) {
    return isAutonomousBuild(state) || envFlag("AES_AUTO_CONFIRM");
}
export function shouldAutoApprovePlan(state) {
    return isAutonomousBuild(state) || envFlag("AES_AUTO_APPROVE");
}
