#!/usr/bin/env python3
"""梦输入法插件打包流水线：打包 → 指纹 → 发布台账，一条命令。

用法：
  python3 meng_pack.py <插件名>          # 打包单个插件（src/<插件名>/plugin/ → dist/）
  python3 meng_pack.py all              # 打包全部插件
  python3 meng_pack.py --record <包>    # 只登记已有 .meng 到台账（不重打包）

产出：
  dist/<id>-v<version>.meng        插件包
  dist/RELEASES.tsv                发布台账（追加一行）：
      时间  id  版本  文件名  大小  zipSHA256  内容指纹

内容指纹规则（将来宿主侧校验用，须与宿主实现完全一致）：
  条目按名字典序，逐条 "name:sha256(content)\\n"，拼接后整体 sha256。
  与压缩参数/时间戳无关，只认内容——改任何一字节指纹即变。

可复现构建：zip 条目统一用固定时间戳 (1980-01-01)，同一份源码
重打包得到字节级相同的 .meng，指纹稳定，避免开发期反复变。
"""
import argparse
import hashlib
import json
import os
import sys
import zipfile
from datetime import datetime, timezone

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# 脚本位于 plugin-packages/tools/ 下（或 plugin-packages 根），仓库根 = 上一级/上两级
ROOT = os.path.dirname(SCRIPT_DIR) if os.path.basename(SCRIPT_DIR) == "tools" else SCRIPT_DIR
SRC = os.path.join(ROOT, "src")
DIST = os.path.join(ROOT, "dist")
LEDGER = os.path.join(DIST, "RELEASES.tsv")

FIXED_DATE = (1980, 1, 1, 0, 0, 0)  # zip 纪元，保证可复现


def content_fingerprint(zpath: str) -> str:
    """包内容指纹：与 scripts/meng_fingerprint.py 及宿主实现保持一致。"""
    with zipfile.ZipFile(zpath) as z:
        names = sorted(n for n in z.namelist() if not n.endswith('/'))
        buf = []
        for n in names:
            h = hashlib.sha256()
            with z.open(n) as f:
                for chunk in iter(lambda: f.read(1 << 16), b''):
                    h.update(chunk)
            buf.append(f"{n}:{h.hexdigest()}\n")
    return hashlib.sha256(''.join(buf).encode()).hexdigest()


def file_sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 16), b''):
            h.update(chunk)
    return h.hexdigest()


def pack(plugin_dir_name: str) -> dict | None:
    """打包 src/<name>/plugin/ → dist/<id>-v<version>.meng，登记台账。"""
    src_dir = os.path.join(SRC, plugin_dir_name, "plugin")
    if not os.path.isdir(src_dir):
        print(f"[skip] {plugin_dir_name}: 无 plugin/ 目录")
        return None
    mf_path = os.path.join(src_dir, "manifest.json")
    if not os.path.isfile(mf_path):
        print(f"[skip] {plugin_dir_name}: 缺 manifest.json")
        return None
    with open(mf_path, encoding='utf-8') as f:
        mf = json.load(f)
    pid, ver = mf["id"], str(mf["version"])
    out = os.path.join(DIST, f"{pid}-v{ver}.meng")
    os.makedirs(DIST, exist_ok=True)

    # 收集全部文件（递归，相对 plugin/ 的路径作 zip 条目名）
    entries = []
    for base, _dirs, files in os.walk(src_dir):
        for fn in sorted(files):
            full = os.path.join(base, fn)
            arc = os.path.relpath(full, src_dir).replace(os.sep, '/')
            entries.append((arc, full))
    entries.sort(key=lambda t: t[0])

    # 确定性打包：固定时间戳 + 固定属性行为，内容不变 → 字节不变
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for arc, full in entries:
            zi = zipfile.ZipInfo(arc, date_time=FIXED_DATE)
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = 0o644 << 16
            with open(full, 'rb') as f:
                z.writestr(zi, f.read())

    info = {
        "id": pid, "version": ver, "file": os.path.basename(out),
        "size": os.path.getsize(out),
        "zip_sha256": file_sha256(out),
        "fingerprint": content_fingerprint(out),
    }
    append_ledger(info)
    print(f"[ok] {info['file']}  {info['size']}B")
    print(f"     指纹 {info['fingerprint']}")
    return info


def append_ledger(info: dict) -> None:
    """追加台账行；与末行完全相同（同名+同指纹）则跳过，避免重复登记。"""
    cols = [info["id"], info["version"], info["file"]]
    line = "\t".join([
        datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), *cols,
        str(info["size"]), info["zip_sha256"], info["fingerprint"],
    ])
    last = None
    if os.path.isfile(LEDGER):
        with open(LEDGER, encoding='utf-8') as f:
            lines = [l.rstrip("\n") for l in f if l.strip()]
        last = lines[-1] if lines else None
        # 同名+同指纹的去重（时间列不同无所谓，比对后五列）
        dup = any(l.split("\t")[2:] == line.split("\t")[2:] for l in lines)
        if dup:
            return
    if last is None:
        with open(LEDGER, 'w', encoding='utf-8') as f:
            f.write("# 梦输入法插件发布台账（meng_pack.py 自动维护）\n")
            f.write("# 列: 时间 id 版本 文件名 大小 zipSHA256 内容指纹\n")
    with open(LEDGER, 'a', encoding='utf-8') as f:
        f.write(line + "\n")


def record(paths: list[str]) -> None:
    """登记已有 .meng（不重打包）：从包内 manifest 读 id/version。"""
    for p in paths:
        try:
            with zipfile.ZipFile(p) as z:
                mf = json.loads(z.read("manifest.json").decode('utf-8'))
        except Exception as e:
            print(f"[skip] {p}: {e}")
            continue
        info = {
            "id": mf["id"], "version": str(mf["version"]),
            "file": os.path.basename(p), "size": os.path.getsize(p),
            "zip_sha256": file_sha256(p), "fingerprint": content_fingerprint(p),
        }
        append_ledger(info)
        print(f"[record] {info['file']}  指纹 {info['fingerprint']}")


def main() -> None:
    ap = argparse.ArgumentParser(description="梦输入法插件打包流水线")
    ap.add_argument("target", help="插件目录名 | all | --record 模式下传占位")
    ap.add_argument("--record", nargs="*", help="只登记已有 .meng，不重打包")
    args = ap.parse_args()

    if args.record is not None:
        record(args.record or [])
        return
    if args.target == "all":
        names = sorted(d for d in os.listdir(SRC) if os.path.isdir(os.path.join(SRC, d)))
        for n in names:
            pack(n)
    else:
        if pack(args.target) is None:
            sys.exit(1)


if __name__ == '__main__':
    main()