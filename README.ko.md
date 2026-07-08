# AI Relay

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

![AI Relay poster](img-en.png)

`airelay`는 로컬 AI Coding CLI 세션을 백업, 복원, 확인, 이전하기 위한 도구입니다.

현재 기본 모드는 V1.1 local-first 입니다.

- Claude Code와 Codex CLI 감지
- 로컬 export/import/backup/restore
- 백업 내용 확인
- 로컬 세션 목록 표시
- 단일 세션 내보내기
- 가져오기 시 기본적으로 기존 파일을 덮어쓰지 않음
- 가져오기 전에 자동 롤백 스냅샷 생성
- 빈 설정 지원
- V2 클라우드 동기화는 스토리지를 명시적으로 설정한 경우에만 활성화

## 왜 필요한가

AI Coding 도구는 중요한 세션 기록을 로컬 머신에 저장합니다. 컴퓨터를 바꾸거나 개발 환경을 다시 구성하거나 위험한 작업 전에 `.claude`와 `.codex` 폴더를 직접 복사하면 파일 누락이나 잘못된 덮어쓰기가 발생하기 쉽습니다.

AI Relay는 이 과정을 반복 가능한 CLI 워크플로로 바꿉니다.

```bash
airelay export --output backup.zip
airelay import backup.zip
airelay rollback
```

기본 내보내기는 session/history 데이터만 포함합니다. `auth.json`, 토큰, 인증 정보, 설정 파일, `.env`, `.pem`, `.key`, cache, tmp, logs, plugins 같은 민감한 파일은 제외됩니다.

## npm에서 설치

게시된 npm 패키지를 설치합니다.

```bash
npm install -g ai-relay-cli
```

실행 예:

```bash
airelay doctor
airelay export
airelay inspect backup_2026-07-07.zip
airelay import backup_2026-07-07.zip
```

## 로컬 빌드

로컬 개발용:

```bash
npm install
npm run build
npm link
```

link 후 명령을 실행합니다.

```bash
airelay doctor
airelay export
airelay inspect backup_2026-07-07.zip
airelay import backup_2026-07-07.zip
```

link 없이도 실행할 수 있습니다.

```bash
node dist/index.js doctor
node dist/index.js export --yes
```

## 일반 워크플로

백업 생성:

```bash
airelay export --output backup.zip
```

하나의 제공자만 내보내기:

```bash
airelay export --only claude --output claude-backup.zip --yes
airelay export --only codex --output codex-backup.zip --yes
```

특정 세션 내보내기:

```bash
airelay export --session claude:projects/my-project/session.jsonl
```

복원 전에 백업 확인:

```bash
airelay inspect backup.zip
```

기존 파일을 덮어쓰지 않고 복원:

```bash
airelay import backup.zip
```

다른 컴퓨터에 맞게 프로젝트 경로를 변환하며 복원:

```bash
airelay import backup.zip --map-path /Users/alice/work=/Users/bob/dev
```

가져오기 전 스냅샷으로 롤백:

```bash
airelay rollback
```

## 명령어

```bash
airelay doctor
airelay ls
airelay export
airelay export --session claude:projects/my-project/session.jsonl
airelay inspect backup.zip
airelay import backup.zip
airelay import backup.zip --map-path /Users/alice/work=/Users/bob/dev
airelay import backup.zip --overwrite
airelay rollback
airelay rollback --list
```

별칭:

```bash
airelay backup
airelay restore backup.zip
```

V2 명령은 스토리지를 설정한 뒤 사용합니다.

```bash
airelay push
airelay pull
airelay sync
```

## 안전 모델

`airelay`는 local-first이며 보수적인 기본 동작을 사용합니다.

- 기본 내보내기는 session/history 데이터만 포함합니다.
- `--full`은 더 넓은 비민감 데이터를 포함하지만 민감한 파일은 계속 제외합니다.
- 가져오기는 `--overwrite`를 지정하지 않는 한 기존 파일을 유지합니다.
- 각 가져오기 전에 `~/.airelay/rollbacks/`에 롤백 스냅샷을 생성합니다.
- `rollback --list`로 사용 가능한 스냅샷을 확인할 수 있습니다.

더 넓은 비민감 백업:

```bash
airelay export --full
```

자동화 예:

```bash
airelay rollback --list
airelay rollback pre_import_20260707T150000Z --yes
```

## 설정

`airelay`는 현재 디렉터리의 설정을 먼저 읽고, 그다음 사용자 설정 디렉터리를 읽습니다.

- `./airelay.config.yml`
- `./airelay.config.yaml`
- `./airelay.config.json`
- `~/.airelay/config.yml`
- `~/.airelay/config.yaml`
- `~/.airelay/config.json`

특정 설정 파일 사용:

```bash
airelay --config /path/to/config.yml ...
```

설정은 선택 사항입니다. 빈 설정은 다음과 같습니다.

```yaml
version: "1.1"
storage:
  type: local
cloud_sync:
  enabled: false
```

최소 MinIO/S3 호환 설정:

```yaml
version: "2"
storage:
  type: s3
  bucket: airelay
  region: us-east-1
  endpoint: http://127.0.0.1:9000
  prefix: backups
  access_key_id: minioadmin
  secret_access_key: minioadmin
  force_path_style: true
cloud_sync:
  enabled: true
```

기존 백업 업로드:

```bash
airelay push backup_2026-07-08.zip
```

백업 다운로드 및 복원:

```bash
airelay pull backup_2026-07-08.zip
```

## 홍보 문구

```text
AI Relay
AI Coding 세션을 다음 환경으로 안전하게 이동
Local-first / Privacy-friendly / Rollback-ready
```

짧은 설명:

```text
.claude와 .codex 폴더를 직접 복사하지 않아도 됩니다. AI Relay로 AI Coding 세션을 백업, 확인, 복원, 롤백하세요.
```

포스터 사양은 [spec.md](spec.md)를 참고하세요.
