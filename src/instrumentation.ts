// 서버가 켜질 때 한 번 불린다. 팀 이슈 조사 예약 확인을 시작한다
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startJobsScheduler } = await import("@/lib/dobbyJobs");
    startJobsScheduler();
  }
}
