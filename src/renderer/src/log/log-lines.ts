/**
 * 로그 본문을 라인 배열로 나눈다(순수). (04 §2, M11_1)
 * CRLF/LF 모두 처리하고, 마지막 줄바꿈으로 생기는 빈 라인은 제거한다.
 */
export function splitLines(content: string): string[] {
  if (content === '') return []
  const lines = content.split(/\r\n|\r|\n/)
  // 파일이 개행으로 끝나면 마지막 빈 항목 1개를 제거한다(허위 빈 라인 방지).
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}
