"""
账单解析器工厂
根据平台类型返回对应的解析器实例
"""

from app.parsers.base import BaseParser, Platform
from app.parsers.alipay import AlipayParser
from app.parsers.wechat import WechatParser
from app.parsers.douyin import DouyinParser

PARSER_MAP: dict[Platform, type[BaseParser]] = {
    Platform.ALIPAY: AlipayParser,
    Platform.WECHAT: WechatParser,
    Platform.DOUYIN: DouyinParser,
}


def get_parser(platform: Platform) -> BaseParser:
    """获取指定平台的解析器"""
    parser_cls = PARSER_MAP.get(platform)
    if parser_cls is None:
        raise ValueError(f"Unsupported platform: {platform}")
    return parser_cls()
