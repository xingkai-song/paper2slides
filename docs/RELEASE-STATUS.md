# 上线状态

2026-11-06，用户确认允许上线。

- Anna staging App：Paper2Slides（app_id 257），slug `paper2slides-ai`。
- 工作草稿 r12，bundle ready，服务端 dirty_vs_latest_cut=false：已经有对应固定版本，无需重复 cut。
- 最新版本1.0.3（id599），平台当前审核目标也是1.0.3。
- 已执行 `anna-app apps release 1.0.3 --account https://staging.anna.partners`，CLI拒绝：`app status is pending_review; release not permitted — awaiting admin approval — cannot release until APPROVED`。
- 因平台审批尚未完成，本应用尚未正式上线。未重提审核、未切换审核版本。

平台审核通过后再执行上述release命令，并核对状态PUBLISHED、版本is_latest=true及published_at非空。开发者控制台：https://staging.anna.partners/developer?app=257&tab=versions 。
