#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
构建 smart-dict 的 SQLite 词典库（dict.db）：
  读 dict.txt（TSV：word\\tdef，108 万行）→ 生成 dict.db

表结构（WITHOUT ROWID，主键=word 的 B-tree，点查/前缀查都走索引）：
  dict(word TEXT PRIMARY KEY, def BLOB)
    def BLOB = 1 字节 flag(0=raw,1=zlib) + 原始/zlib 压缩字节

体积优化（对比 v1 110MB / v2 87MB）：
  - def 用 zlib 而非 gzip：每行省 12B 头尾（108万×12≈13MB）
  - 短释义（UTF-8 < 48B）不压缩：deflate 对短中文收益低，避免越压越大
  - 长释义 zlib level 9：中文长段压缩率高

查询策略（宿主侧）：
  1. 精确点查：word = ?（主键 B-tree，O(log n)）
  2. 最大正向匹配：query 每位置尝试 1..8 字符的精确点查，命中即收集
     → 「输入框全文查词」的 O(文本长×8) 索引点查，毫秒级
  3. 子串兜底：word LIKE '%q%' ESCAPE '\\' LIMIT（短 query 才用，后台线程）

用法：python3 build_dict_db.py dict.txt dict.db
"""
import sqlite3
import sys
import time
import zlib

RAW = 0
Z = 1


def pack_def(text: str) -> bytes:
    raw = text.encode("utf-8")
    if len(raw) < 48:
        return bytes([RAW]) + raw
    comp = zlib.compress(raw, 9)
    # 压缩后没变小就不压
    if len(comp) + 1 >= len(raw) + 1:
        return bytes([RAW]) + raw
    return bytes([Z]) + comp


def main():
    src, dst = sys.argv[1], sys.argv[2]
    t0 = time.time()
    conn = sqlite3.connect(dst)
    conn.execute("PRAGMA journal_mode=OFF")
    conn.execute("PRAGMA synchronous=OFF")
    conn.execute("PRAGMA cache_size=-131072")  # 128MB 页缓存，加速构建
    conn.execute("PRAGMA temp_store=MEMORY")
    conn.execute("DROP TABLE IF EXISTS dict")
    conn.execute("CREATE TABLE dict(word TEXT PRIMARY KEY, def BLOB) WITHOUT ROWID")
    cur = conn.cursor()
    batch = []
    total = 0
    with open(src, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if not line or "\t" not in line:
                continue
            w, d = line.split("\t", 1)
            batch.append((w, pack_def(d)))
            total += 1
            if len(batch) >= 50000:
                try:
                    cur.executemany("INSERT INTO dict VALUES (?,?)", batch)
                except sqlite3.IntegrityError:
                    cur.executemany("INSERT OR IGNORE INTO dict VALUES (?,?)", batch)
                batch = []
                if total % 500000 == 0:
                    print(f"  {total} rows... {time.time()-t0:.0f}s", flush=True)
    if batch:
        try:
            cur.executemany("INSERT INTO dict VALUES (?,?)", batch)
        except sqlite3.IntegrityError:
            cur.executemany("INSERT OR IGNORE INTO dict VALUES (?,?)", batch)
    conn.commit()
    print(f"  insert {total} rows, {time.time()-t0:.0f}s", flush=True)
    conn.close()
    import os
    size = os.path.getsize(dst)
    print(f"  done: {dst} ({size/1024/1024:.1f} MB), {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()