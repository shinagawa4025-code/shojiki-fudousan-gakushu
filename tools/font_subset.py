# 見出し用の書体のサブセットを作る(tools/font_subset.js から呼ぶ。単体では使わない)
# 使い方: python -I tools/font_subset.py <元のフォント.ttf> <出力.woff2>   (入れたい文字のコードポイントの JSON 配列を標準入力に渡す)
# 標準出力に JSON: { included: [入れたコードポイント], notInFont: [元のフォントにないもの], features: [残した機能], fontTools: 版 }
# 必要: fontTools と brotli(pip install "fonttools[woff]")
import json
import sys

from fontTools import subset, version as FT_VERSION

# 横書きの日本語に要る機能だけ残す(縦書きの vert などは使わない)。palt は元のフォントにあれば残す(M PLUS Rounded 1c にはない)
FEATURES = ['ccmp', 'liga', 'kern', 'mark', 'mkmk', 'palt']


def main():
    src, out = sys.argv[1], sys.argv[2]
    wanted = set(json.load(sys.stdin))
    options = subset.Options()
    options.flavor = 'woff2'
    options.layout_features = FEATURES
    # 見出し・ボタン(13px 以上)だけに使うので、ヒンティングは外して小さくする
    options.hinting = False
    # 著作権(0)・名前(1〜6)・ライセンス(13・14)を残す(SIL OFL 1.1 はフォントと一緒にライセンスを配ることを求める)
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
    options.name_languages = ['*']
    options.drop_tables += ['vhea', 'vmtx', 'VORG']
    options.notdef_outline = True
    options.prune_unicode_ranges = True
    # 同じ入力から同じファイルができるように(更新日時を書き換えない)
    options.recalc_timestamp = False
    font = subset.load_font(src, options)
    have = set(font.getBestCmap().keys())
    keep = sorted(wanted & have)
    tables = {t: font[t] for t in ('GSUB', 'GPOS') if t in font}
    before = sorted({fr.FeatureTag for t in tables.values() if t.table.FeatureList for fr in t.table.FeatureList.FeatureRecord})
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=keep)
    subsetter.subset(font)
    after = sorted({fr.FeatureTag for t in ('GSUB', 'GPOS') if t in font and font[t].table.FeatureList for fr in font[t].table.FeatureList.FeatureRecord})
    subset.save_font(font, out, options)
    json.dump({
        'included': keep,
        'notInFont': sorted(wanted - have),
        'featuresInSource': before,
        'features': after,
        'glyphs': len(font.getGlyphOrder()),
        'fontTools': FT_VERSION,
    }, sys.stdout)


if __name__ == '__main__':
    main()
