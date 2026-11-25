#!/usr/bin/env python3
"""计算 .meng 插件包内容指纹（官方完整性校验用）。

指纹规则（与宿主 MengPackage.fingerprintOf 完全一致）：
  1. 取 zip 内全部条目（含目录外的所有文件条目），按名字典序排序；
  2. 每个条目计算 "name:sha256(content)\\n"；
  3. 全部拼接后整体 sha256 → hex 即包指纹。

特性：与压缩方式/时间戳无关，只认内容——重打包改任何一字节指纹即变。

用法：
  python3 meng_fingerprint.py <pkg.meng> [pkg2.meng ...]
"""
import hashlib
import sys
import zipfile


def fingerprint(path: str) -> str:
    with zipfile.ZipFile(path) as z:
        names = sorted(n for n in z.namelist() if not n.endswith('/'))
        buf = []
        for n in names:
            h = hashlib.sha256()
            with z.open(n) as f:
                for chunk in iter(lambda: f.read(1 << 16), b''):
                    h.update(chunk)
            buf.append(f"{n}:{h.hexdigest()}\n")
    return hashlib.sha256(''.join(buf).encode()).hexdigest()


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    for p in sys.argv[1:]:
        print(f"{fingerprint(p)}  {p}")


if __name__ == '__main__':
    main()
